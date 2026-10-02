import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSSRApp, h} from 'vue';
import {renderToString} from '@vue/server-renderer';
import {router} from '@inertiajs/vue3';
import {useInertiaPlus, useInertiaPlusForm} from 'strata-packages/inertia-plus';

for (const minimumLoading of [false, true]) {
    test(`package export preserves bound forms with minimumLoading=${minimumLoading}`, async (t) => {
        let request;
        t.mock.method(router, 'post', (url, data, options) => { request = {url, data, options}; });
        let form;
        await renderToString(createSSRApp({setup() {
            form = useInertiaPlusForm({minimumLoading, minimumLoadingDuration: 0, openable: true}, {
                name: '',
                submit() { this.post('/save'); },
            });
            return () => h('div');
        }}));
        assert.equal(form.isOpen, false);
        form.show({name: 'Example'});
        assert.equal(form.name, 'Example');
        assert.equal(form.isOpen, true);
        form.submit();
        assert.equal(request.url, '/save');
        assert.deepEqual(request.data, {name: 'Example'});
        await request.options.onError({name: 'Invalid name'});
        request.options.onFinish({});
        assert.equal(form.processing, false);
        assert.equal(form.errors.name, 'Invalid name');
        form.setOpen(false);
        assert.equal(form.isOpen, false);
        assert.equal(form.name, '');
        assert.deepEqual(form.errors, {});
    });
}

test('package export preserves the managed reload member', () => {
    const state = useInertiaPlus({count: 0});
    assert.equal(typeof state.reload, 'function');
    assert.equal(Object.keys(state).includes('reload'), false);
    assert.throws(() => useInertiaPlus({reload() {}}), /managed/);
});
