import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLab, words } from './server.mjs';
import { apply, empty, observe } from './docs/client.mjs';

async function fixture(t) {
  let calls = 0;
  const gate = Promise.withResolvers();
  async function* model() {
    calls++;
    yield* words.slice(0, 5);
    await gate.promise;
    yield* words.slice(5);
  }
  const server = createLab(':memory:', model);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    gate.resolve();
    server.closeAllConnections();
    server.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const { id } = await (await fetch(base + '/runs', { method: 'POST' })).json();
  let state = empty();
  async function attach(handle, after = state) {
    const controller = new AbortController();
    await observe(base, id, after, controller.signal, event => {
      handle(event, () => controller.abort(), () => { state = apply(state, event); });
    });
  }
  function verify() {
    assert.deepEqual(state, { text: words.join(''), cursor: words.length + 1, status: 'done' });
    assert.equal(calls, 1);
  }
  return { attach, verify, release: gate.resolve, log: async () => (await fetch(base + '/log?id=' + id)).json() };
}

test('reconnect after event 4 while generation is active', async t => {
  const lab = await fixture(t);
  await lab.attach((event, stop, commit) => { commit(); if (event.seq === 4) stop(); });
  await lab.attach((event, stop, commit) => { commit(); if (event.seq === 5) lab.release(); });
  lab.verify();
});

test('chunk 5 arrives twice across connections and appears once', async t => {
  const lab = await fixture(t);
  let deliveries = 0;
  await lab.attach((event, stop, commit) => {
    commit();
    if (event.seq === 5) { deliveries++; stop(); }
  });
  // Reattach with an older cursor, as if an acknowledgement was lost.
  await lab.attach((event, stop, commit) => {
    if (event.seq === 5) { deliveries++; lab.release(); }
    commit();
  }, { ...empty(), cursor: 4 });
  assert.equal(deliveries, 2);
  lab.verify();
});

test('generation finishes offline and the client consumes its saved terminal event', async t => {
  const lab = await fixture(t);
  await lab.attach((event, stop, commit) => { commit(); if (event.seq === 4) stop(); });
  lab.release();
  assert.equal((await lab.log()).at(-1).kind, 'done');
  await lab.attach((event, stop, commit) => commit());
  lab.verify();
  await lab.attach(() => assert.fail('A completed transcript should not receive another event'));
});
