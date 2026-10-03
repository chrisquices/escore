import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, file, fileList} from './helpers/dropzone.ts';

test('dropzone accepts File, FileList and File arrays, preserving order and identity', function (t) {
    const f = createFixture(t);
    const files = [file('one', 1), file('two', 2), file('three', 3), file('four', 4)];
    assert.deepEqual(f.engine.addFiles(files[0]), {accepted: [files[0]], errors: []});
    assert.deepEqual(f.engine.addFiles(fileList([files[1]])), {accepted: [files[1]], errors: []});
    const batch = files.slice(2);
    const result = f.engine.addFiles(batch);
    batch.length = 0;
    result.accepted.length = 0;
    assert.deepEqual(f.engine.getState().files, files);
    files.forEach((value, index) => assert.equal(f.engine.getState().files[index], value));
    assert.equal(f.engine.getState().count, 4);
    assert.equal(f.engine.getState().totalSize, 10);
    assert.equal(f.events.length, 3);
});

test('dropzone extension filters are case-insensitive filename suffixes, independent of MIME', function (t) {
    const f = createFixture(t, {accept: ['.PNG', '.tar.gz'], exclude: ['.bad.PNG']});
    const accepted = [file('photo.png', 4, 'application/pdf'), file('bundle.TAR.GZ')];
    const excluded = file('photo.BAD.png');
    const invalid = file('photo.jpg', 4, 'image/png');
    const result = f.engine.addFiles([...accepted, excluded, invalid]);
    assert.deepEqual(result.accepted, accepted);
    assert.deepEqual(result.errors.map(error => error.id), ['excluded-extension', 'invalid-extension']);
    assert.deepEqual(result.errors.map(error => error.metadata.files), [[excluded], [invalid]]);
    assert.deepEqual(f.errors, result.errors);
});

test('dropzone reports the first applicable validation failure for each file', function (t) {
    const f = createFixture(t, {accept: ['.txt'], exclude: ['.blocked.txt'], minSize: 2, maxSize: 4});
    const cases = [
        [file('invalid.png', 0), 'invalid-extension'],
        [file('one.blocked.txt', 0), 'excluded-extension'],
        [file('empty.txt', 0), 'empty-file'],
        [file('small.txt', 1), 'file-too-small'],
        [file('large.txt', 5), 'file-too-large'],
    ];
    const result = f.engine.addFiles(cases.map(([value]) => value));
    assert.deepEqual(result.accepted, []);
    assert.deepEqual(result.errors.map(error => error.id), cases.map(([, id]) => id));
    cases.forEach(([value], index) => {
        assert.deepEqual(result.errors[index].metadata.files, [value]);
        assert.ok(result.errors[index].message.length > 0);
    });
    assert.deepEqual(f.errors, result.errors);
    assert.equal(f.events.length, 0);
});

test('dropzone rejects empty files by default and accepts exact min/max boundaries', function (t) {
    const defaultFixture = createFixture(t);
    assert.equal(defaultFixture.engine.addFiles(file('empty', 0)).errors[0].id, 'empty-file');
    const f = createFixture(t, {minSize: 2, maxSize: 4});
    const files = [file('min', 2), file('max', 4)];
    assert.deepEqual(f.engine.addFiles(files), {accepted: files, errors: []});
});

test('dropzone rejects every same-batch name collision and groups each name once', function (t) {
    const f = createFixture(t);
    const kept = file('existing.txt');
    f.engine.addFiles(kept);
    const collisions = [file('SAME.txt'), file('same.TXT'), file('EXISTING.txt'), file('existing.TXT')];
    const good = file('unique.txt');
    const result = f.engine.addFiles([...collisions, good]);
    assert.deepEqual(result.accepted, [good]);
    assert.deepEqual(result.errors.map(error => error.id), ['duplicate', 'duplicate']);
    assert.deepEqual(result.errors.map(error => error.metadata.files), [collisions.slice(0, 2), collisions.slice(2)]);
    assert.deepEqual(f.engine.getState().files, [kept, good]);
});

test('dropzone dedupes only surviving candidates and supports disabled dedupe', function (t) {
    const f = createFixture(t, {minSize: 2});
    const invalid = file('same', 1);
    const good = file('SAME', 2);
    assert.deepEqual(f.engine.addFiles([invalid, good]).accepted, [good]);
    assert.deepEqual(f.errors.map(error => error.id), ['file-too-small']);
    const duplicates = createFixture(t, {dedupe: false});
    const other = file('SAME', 2);
    assert.deepEqual(duplicates.engine.addFiles([good, good, other]).accepted, [good, good, other]);
    assert.equal(duplicates.engine.getState().count, 3);
});

for (const [config, id] of [
    [{multiple: false}, 'single-file'],
    [{maxFiles: 2}, 'max-files'],
    [{maxTotalSize: 5}, 'max-total-size'],
]) {
    test(`dropzone ${id} rejects the whole surviving batch without removing existing files`, function (t) {
        const f = createFixture(t, config);
        const existing = file('existing', 2);
        const batch = [file('one', 2), file('two', 2)];
        f.engine.addFiles(existing);
        const result = f.engine.addFiles(batch);
        assert.deepEqual(result.accepted, []);
        assert.deepEqual(result.errors.map(error => error.id), [id]);
        assert.deepEqual(result.errors[0].metadata.files, batch);
        assert.deepEqual(f.engine.getState().files, [existing]);
        assert.equal(f.events.length, 1);
    });
}

test('dropzone applies whole-batch caps after filtering and dedupe, accepting exact limits', function (t) {
    const f = createFixture(t, {maxFiles: 2, maxTotalSize: 4});
    const first = file('first', 2);
    const second = file('second', 2);
    f.engine.addFiles(first);
    const result = f.engine.addFiles([file('empty', 0), file('FIRST', 2), second]);
    assert.deepEqual(result.accepted, [second]);
    assert.deepEqual(result.errors.map(error => error.id), ['empty-file', 'duplicate']);
    assert.equal(f.engine.getState().totalSize, 4);
});

test('dropzone preserves validation errors before reporting the first whole-batch cap', function (t) {
    const f = createFixture(t, {multiple: false, maxFiles: 1, maxTotalSize: 1});
    const files = [file('one', 2), file('two', 2)];
    const result = f.engine.addFiles([file('empty', 0), ...files]);
    assert.deepEqual(result.errors.map(error => error.id), ['empty-file', 'single-file']);
    assert.deepEqual(result.errors[1].metadata.files, files);
    const count = createFixture(t, {maxFiles: 1, maxTotalSize: 1});
    assert.deepEqual(count.engine.addFiles(files).errors.map(error => error.id), ['max-files']);
});

test('dropzone removes by File identity and clear resets totals once', function (t) {
    const f = createFixture(t);
    const first = file('one');
    const second = file('two');
    f.engine.addFiles([first, second]);
    assert.equal(f.engine.removeFile(file('one')), false);
    assert.equal(f.engine.removeFile(first), true);
    assert.equal(f.engine.removeFile(first), false);
    assert.deepEqual(f.engine.getState().files, [second]);
    f.engine.clearFiles();
    f.engine.clearFiles();
    assert.equal(f.engine.getState().totalSize, 0);
    assert.equal(f.engine.getState().count, 0);
    assert.equal(f.events.length, 3);
});

test('dropzone replacement preserves position and validates against the remaining collection', function (t) {
    const f = createFixture(t, {maxFiles: 3, maxTotalSize: 8});
    const files = [file('first', 2), file('middle', 4), file('last', 2)];
    f.engine.addFiles(files);
    const replacement = file('MIDDLE', 4);
    assert.equal(f.engine.replaceFile(files[1], replacement), true);
    assert.deepEqual(f.engine.getState().files, [files[0], replacement, files[2]]);
    assert.equal(f.engine.getState().totalSize, 8);
    assert.equal(f.engine.replaceFile(file('missing'), replacement), false);
});

test('dropzone failed replacement is atomic for validation, duplicates, totals and non-File values', function (t) {
    const f = createFixture(t, {accept: ['.txt'], maxTotalSize: 8});
    const files = [file('first.txt'), file('last.txt')];
    f.engine.addFiles(files);
    for (const [replacement, id] of [
        [file('invalid.png'), 'invalid-extension'],
        [file('empty.txt', 0), 'empty-file'],
        [file('LAST.txt'), 'duplicate'],
        [file('large.txt', 5), 'max-total-size'],
    ]) {
        assert.equal(f.engine.replaceFile(files[0], replacement), false);
        assert.equal(f.errors.at(-1).id, id);
        assert.deepEqual(f.engine.getState().files, files);
    }
    for (const value of [null, new Blob(['data']), {}, 'file']) {
        assert.throws(() => f.engine.replaceFile(files[0], value), /replacement must be a File/);
        assert.deepEqual(f.engine.getState().files, files);
    }
    assert.equal(f.events.length, 1);
});

test('dropzone disabled state gates acquisition UI while programmatic mutations remain available', function (t) {
    const f = createFixture(t, {disabled: true});
    const first = file('one');
    const second = file('two');
    assert.deepEqual(f.engine.addFiles(first).accepted, [first]);
    assert.equal(f.engine.replaceFile(first, second), true);
    assert.equal(f.engine.removeFile(second), true);
    f.engine.addFiles(first);
    f.engine.clearFiles();
    assert.equal(f.engine.getState().count, 0);
    assert.equal(f.engine.getState().disabled, true);
});

test('dropzone public file sizes use decimal units while limit messages use binary units', function (t) {
    const f = createFixture(t, {maxSize: 1024});
    for (const [size, sizeFormatted] of [[0, '0.0 B'], [999, '999.0 B'], [1000, '1.0 KB'], [1500, '1.5 KB'], [1e6, '1.0 MB'], [1e9, '1.0 GB'], [1e12, '1.0 TB'], [1e15, '1000.0 TB']]) {
        const value = file();
        Object.defineProperty(value, 'size', {value: size});
        assert.deepEqual(f.engine.getFileSize(value), {size, sizeFormatted});
    }
    assert.match(f.engine.addFiles(file('big', 1025)).errors[0].message, /1\.0 KB/);
});
