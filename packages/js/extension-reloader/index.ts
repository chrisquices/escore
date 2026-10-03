import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {readdir, readFile, stat, writeFile} from 'node:fs/promises'
import {resolve, relative, isAbsolute, join} from 'node:path'
import {parseArgs} from 'node:util'
import {WebSocket, WebSocketServer} from 'ws'

const {values} = parseArgs({
  options: {
    build: {type: 'string', default: 'npm run build'},
    'out-dir': {type: 'string', default: 'dist'},
    port: {type: 'string', default: '17373'},
    watch: {type: 'string', multiple: true, default: []},
    help: {type: 'boolean', short: 'h'},
  },
})

if (values.help) {
  console.info('Usage: node extension-reloader/index.ts [--build "npm run build"] [--out-dir dist] [--port 17373] [--watch path]')
  process.exit(0)
}

const root = process.cwd()
const output = resolve(root, values['out-dir'])
const port = Number(values.port)
const ignored = new Set(['node_modules', '.git', '.idea', '.codex', '.agents', '.cache', 'coverage', '.DS_Store'])
const roots = [...new Set([root, ...values.watch.map((path) => resolve(root, path))])]
const url = `ws://127.0.0.1:${port}/extension-reloader`
let revision: string | undefined
let stopping = false
let child: ReturnType<typeof spawn> | undefined
let pending = true
let building = false
let lastChange = 0

function inside(parent: string, path: string) {
  const suffix = relative(parent, path)

  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(suffix))
}

if (!Number.isInteger(port) || port < 1 || port > 65535 || inside(output, root)) {
  throw new Error('Use a port between 1 and 65535 and an output directory separate from the project root.')
}

await readFile(join(root, 'package.json'), 'utf8')

const server = new WebSocketServer({
  host: '127.0.0.1',
  port,
  path: '/extension-reloader',
  maxPayload: 1024,
  verifyClient: ({origin}: {origin: string}) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin),
})

await new Promise<void>((accept, reject) => {
  server.once('listening', accept)
  server.once('error', reject)
})

server.on('connection', (socket) => {
  socket.on('error', (error) => console.error('[extension-reloader] Connection:', error.message))

  if (revision) {
    socket.send(revision)
  }
})

function helper(version: string) {
  return `
;(() => {
  const version = ${JSON.stringify(version)};
  const connect = () => {
    const socket = new WebSocket(${JSON.stringify(url)});
    let heartbeat;
    socket.onopen = () => {
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, 20000);
    };
    socket.onmessage = (event) => {
      if (event.data !== version) chrome.runtime.reload();
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearInterval(heartbeat);
      setTimeout(connect, 1000);
    };
  };
  connect();
})();
`
}

async function inject(version: string) {
  const manifestPath = join(output, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (manifest.manifest_version !== 3 || typeof manifest.background?.service_worker !== 'string') {
    throw new Error('Expected a Manifest V3 extension with background.service_worker in the build output.')
  }

  const worker = resolve(output, manifest.background.service_worker)

  if (!inside(output, worker) || worker === output) {
    throw new Error('The background service worker must be inside the build output.')
  }

  const policy = manifest.content_security_policy?.extension_pages

  if (policy) {
    const directives = policy.split(';').map((part: string) => part.trim()).filter(Boolean)
    const connection = directives.findIndex((part: string) => /^connect-src(?:\s|$)/.test(part))

    if (connection >= 0) {
      directives[connection] = directives[connection].replace(/\s+'none'(?=\s|$)/g, '') + ` ws://127.0.0.1:${port}`
    } else {
      const fallback = directives.find((part: string) => /^default-src(?:\s|$)/.test(part))

      if (fallback) {
        directives.push(fallback.replace(/^default-src/, 'connect-src').replace(/\s+'none'(?=\s|$)/g, '') + ` ws://127.0.0.1:${port}`)
      }
    }

    manifest.content_security_policy.extension_pages = directives.join('; ') + ';'
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  }

  const source = await readFile(worker, 'utf8')
  const marker = '\n/* extension-reloader development helper */\n'
  const original = source.split(marker)[0]
  await writeFile(worker, original + marker + helper(version))
}

async function snapshot() {
  const files = new Map<string, string>()

  async function scan(directory: string) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name)

      if (ignored.has(entry.name) || inside(output, path) || entry.isSymbolicLink()) {
        continue
      }

      try {
        if (entry.isDirectory()) {
          await scan(path)
        } else if (entry.isFile()) {
          const info = await stat(path)
          files.set(path, `${info.mtimeMs}:${info.ctimeMs}:${info.size}`)
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
  }

  for (const directory of roots) {
    await scan(directory)
  }

  return files
}

async function build() {
  building = true
  pending = false
  console.info('[extension-reloader] Building…')

  try {
    await new Promise<void>((accept, reject) => {
      child = spawn(values.build, {
        cwd: root,
        shell: true,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        child = undefined

        if (code === 0) {
          accept()
        } else {
          reject(new Error(`Build exited with ${signal ?? code}.`))
        }
      })
    })

    if (stopping) {
      return
    }

    const next = randomUUID()
    await inject(next)
    revision = next

    for (const socket of server.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(revision)
      }
    }

    console.info(`[extension-reloader] Build ready. ${server.clients.size ? 'Reload notified.' : `Load ${output} in Chrome once, or reload the existing extension to activate the helper.`}`)
  } catch (error) {
    if (!stopping) {
      console.error('[extension-reloader] No reload:', (error as Error).message)
    }
  } finally {
    building = false
  }
}

function stop(code = 0) {
  if (stopping) {
    return
  }

  stopping = true
  process.exitCode = code

  if (child?.pid) {
    if (process.platform === 'win32') {
      child.kill('SIGTERM')
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          console.error(error)
        }
      }
    }
  }

  for (const socket of server.clients) {
    socket.terminate()
  }

  server.close()
}

process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
server.on('error', (error) => {
  console.error('[extension-reloader]', error.message)
  stop(1)
})

console.info(`[extension-reloader] Watching ${root}. Press Ctrl+C to stop.`)

try {
  let previous = await snapshot()

  while (!stopping) {
    const current = await snapshot()

    if (current.size !== previous.size || [...current].some(([path, stamp]) => previous.get(path) !== stamp)) {
      pending = true
      lastChange = Date.now()
    }

    previous = current

    if (pending && !building && Date.now() - lastChange >= 150) {
      void build()
    }

    await new Promise((accept) => setTimeout(accept, 300))
  }
} catch (error) {
  console.error('[extension-reloader]', (error as Error).message)
  stop(1)
}
