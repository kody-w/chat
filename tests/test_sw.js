// test_sw.js — run: node tests/test_sw.js
//
// The service worker exists so an installed copy still boots with no network.
// But a cache sitting in front of a LIVENESS probe is a contradiction: the probe's
// only signal is whether the network answered, so a cached "yes" would be replayed
// forever and the page would keep reporting a brainstem that stopped running an
// hour ago. These tests hold that line behaviourally, not by reading the source.

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}

// Minimal ServiceWorkerGlobalScope: enough to load sw.js and capture its handlers.
function loadSW() {
  const handlers = {};
  const sandbox = {
    self: {
      addEventListener: (t, fn) => { handlers[t] = fn; },
      location: { origin: 'https://kody-w.github.io' },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => {} }),
      keys: () => Promise.resolve([]),
      match: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(true),
    },
    fetch: () => Promise.resolve({ ok: true, type: 'basic', clone: () => ({}) }),
    URL,
  };
  sandbox.self.addEventListener = (t, fn) => { handlers[t] = fn; };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), sandbox);
  return handlers;
}

// Did the worker try to answer this request itself?
function intercepts(handlers, url, method) {
  let claimed = false;
  handlers.fetch({
    request: { url, method: method || 'GET' },
    respondWith: () => { claimed = true; },
  });
  return claimed;
}

console.log('\nservice worker');
const h = loadSW();

// ── The guard that matters ────────────────────────────────────────────────────
check('does NOT intercept the loopback burrow probe',
      !intercepts(h, 'http://127.0.0.1:7071/health'),
      'the SW claimed the probe — a cached hit would report a dead brainstem as live');
check('does NOT intercept a probe on a twin port',
      !intercepts(h, 'http://127.0.0.1:7082/health'));
check('does NOT intercept any other cross-origin request',
      !intercepts(h, 'https://api.github.com/user'));

// ── What it SHOULD serve ──────────────────────────────────────────────────────
check('serves the same-origin page shell',
      intercepts(h, 'https://kody-w.github.io/chat/index.html'));
check('serves the detector itself',
      intercepts(h, 'https://kody-w.github.io/chat/burrow.js'));

// ── Never cache a mutation ────────────────────────────────────────────────────
check('ignores non-GET requests',
      !intercepts(h, 'https://kody-w.github.io/chat/', 'POST'));

// ── Shell completeness: an offline boot must include the detector ─────────────
// Caching the page without burrow.js would produce a shell that loads and then
// permanently says "can't tell from here" — worse than not caching at all.
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
['index.html', 'burrow.js', 'manifest.webmanifest'].forEach((f) => {
  check('offline shell includes ' + f, src.includes("'./" + f + "'"));
});

// Every asset the shell promises must actually exist, or install() rejects and
// the worker never activates — a silent, total loss of offline support.
const shell = (src.match(/const SHELL = \[([\s\S]*?)\]/) || [])[1] || '';
shell.split(',').map((s) => s.trim().replace(/^'\.\//, '').replace(/'$/, ''))
  .filter((f) => f && f !== './' && f !== '')
  .forEach((f) => {
    check('shell asset exists on disk: ' + f,
          fs.existsSync(path.join(__dirname, '..', f)), f + ' is listed but missing');
  });

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
