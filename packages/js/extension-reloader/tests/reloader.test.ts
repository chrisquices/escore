import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runInNewContext} from 'node:vm'
import {test} from 'node:test'
import {setTimeout as delay} from 'node:timers/promises'
import {WebSocket} from 'ws'

async function until(condition: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 12000

  while (!await condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for the reloader')
    await delay(50)
  }
}

test('builds from cwd, injects only output, reloads successful builds, recovers and stops', {timeout: 30000}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'extension-reloader-'))
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((accept) => listener.close(() => accept()))
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await writeFile(join(root, 'input.txt'), 'initial')
  await writeFile(join(root, 'build.mjs'), `
import {mkdir, readFile, writeFile} from 'node:fs/promises';
const input = await readFile('input.txt', 'utf8');
console.log('fixture build:' + input);
if (input === 'fail') process.exit(1);
if (input === 'slow') await new Promise(resolve => setTimeout(resolve, 1000));
await mkdir('dist', {recursive: true});
await writeFile('dist/manifest.json', JSON.stringify({
  manifest_version: 3,
  background: {service_worker: 'background.js', type: 'module'},
  content_security_policy: {extension_pages: "script-src 'self'; object-src 'self'; connect-src 'none';"}
}));
await writeFile('dist/background.js', 'globalThis.built = ' + JSON.stringify(input) + ';');
`)

  const script = fileURLToPath(new URL('../index.ts', import.meta.url))
  const child = spawn(process.execPath, [script, '--build', 'node build.mjs', '--port', String(port)], {cwd: root})
  let log = ''
  child.stdout.on('data', (data) => { log += data })
  child.stderr.on('data', (data) => { log += data })
  const exited = once(child, 'exit')
  let socket: WebSocket | undefined
  t.after(async () => {
    socket?.terminate()
    child.kill('SIGTERM')
    await exited
    await rm(root, {recursive: true, force: true})
  })

  await until(() => log.includes('Build ready.'))
  assert.equal(await readFile(join(root, 'input.txt'), 'utf8'), 'initial')
  const source = await readFile(join(root, 'dist/background.js'), 'utf8')
  const manifest = JSON.parse(await readFile(join(root, 'dist/manifest.json'), 'utf8'))
  assert.ok(manifest.content_security_policy.extension_pages.includes(`connect-src ws://127.0.0.1:${port}`))

  const messages: string[] = []
  socket = new WebSocket(`ws://127.0.0.1:${port}/extension-reloader`, {origin: `chrome-extension://${'a'.repeat(32)}`})
  socket.on('message', (data) => messages.push(data.toString()))
  await until(() => messages.length === 1)
  let reloads = 0
  let heartbeat: (() => void) | undefined
  let connection: any

  class BrowserSocket {
    static OPEN = 1
    readyState = 1
    sent: string[] = []
    url: string

    constructor(url: string) {
      this.url = url
      connection = this
    }

    send(message: string) {
      this.sent.push(message)
    }
  }

  runInNewContext(source, {
    WebSocket: BrowserSocket,
    chrome: {runtime: {reload: () => { reloads++ }}},
    setInterval: (callback: () => void, interval: number) => {
      assert.equal(interval, 20000)
      heartbeat = callback
    },
    clearInterval: () => {},
    setTimeout: () => {},
  })
  assert.equal(connection.url, `ws://127.0.0.1:${port}/extension-reloader`)
  connection.onopen()
  heartbeat?.()
  assert.deepEqual(connection.sent, ['ping'])
  connection.onmessage({data: messages[0]})
  assert.equal(reloads, 0)

  await writeFile(join(root, 'input.txt'), 'fail')
  await until(() => log.includes('No reload:'))
  assert.equal(messages.length, 1)
  await writeFile(join(root, 'input.txt'), 'recovered')
  await until(() => messages.length === 2)
  connection.onmessage({data: messages[1]})
  assert.equal(reloads, 1)
  assert.match(await readFile(join(root, 'dist/background.js'), 'utf8'), /recovered/)

  await writeFile(join(root, 'input.txt'), 'slow')
  await until(() => log.includes('fixture build:slow'))
  await writeFile(join(root, 'input.txt'), 'latest')
  await until(() => messages.length === 4)
  assert.match(await readFile(join(root, 'dist/background.js'), 'utf8'), /latest/)
  await delay(1000)
  assert.equal(messages.length, 4, 'Build output must not trigger a rebuild loop')
  const rejected = new WebSocket(`ws://127.0.0.1:${port}/extension-reloader`, {origin: 'https://example.com'})
  await once(rejected, 'error')
  child.kill('SIGTERM')
  const [code] = await exited
  assert.equal(code, 0, log)
})
