// test_burrow.js — run: node tests/test_burrow.js
//
// The detector's job is to be right about three states, and its most dangerous
// failure is not a crash: it is confidently telling someone with a live brainstem
// that they have none. These tests exist mostly to hold that line.

'use strict';
const { detectBurrow, classifyFailure } = require('../burrow.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n         ' + detail : '')); }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// ── Fake fetches standing in for real browser behaviour ───────────────────────
const refused    = () => Promise.reject(new TypeError('Failed to fetch'));
const answering  = (livePorts) => (url) => {
  const port = Number(String(url).match(/:(\d+)\//)[1]);
  // Opaque response: a real no-cors fetch resolves the same way for 200 and 403.
  return livePorts.includes(port) ? Promise.resolve({ type: 'opaque', status: 0 })
                                  : Promise.reject(new TypeError('Failed to fetch'));
};
const mixedContentBlock = () => Promise.reject(
  new TypeError('Mixed Content: The page was loaded over HTTPS, but requested an insecure resource'));
const pnaBlock = () => Promise.reject(
  new TypeError('The request was blocked because it is a private network request'));
const hangs = () => new Promise(() => {});

(async () => {
  console.log('\nburrow detector');

  // ── 1. The default state ────────────────────────────────────────────────────
  let r = await detectBurrow(refused, { timeoutMs: 50 });
  eq('nothing listening -> unburrowed', r.state, 'unburrowed');
  eq('  unburrowed degrades', r.degrade, true);
  eq('  unburrowed is a CERTAIN observation', r.certain, true);
  check('  unburrowed is not framed as an error',
        /default/i.test(r.reason) && !/error|fail/i.test(r.reason), r.reason);

  // ── 2. A brainstem is burrowed ──────────────────────────────────────────────
  r = await detectBurrow(answering([7071]), { timeoutMs: 50 });
  eq('parent on 7071 -> burrowed', r.state, 'burrowed');
  eq('  reports the port', r.port, 7071);
  eq('  does NOT degrade', r.degrade, false);
  eq('  offers the door at its own origin', r.door, 'http://localhost:7071/');

  // A 403 is an answer. This is the case the old checkHealth() got wrong: it did
  // r.json() on the response, which throws on a 403 HTML/JSON error body, and
  // landed in catch() — reporting a live brainstem as absent.
  r = await detectBurrow(answering([7071]), { timeoutMs: 50 });
  eq('a 403-answering brainstem still counts as burrowed', r.state, 'burrowed');

  // ── 3. A booted twin, not the parent ────────────────────────────────────────
  r = await detectBurrow(answering([7082]), { timeoutMs: 50 });
  eq('twin on 7082 -> burrowed', r.state, 'burrowed');
  eq('  door points at the twin, not the parent', r.door, 'http://localhost:7082/');

  // Parent wins when both are up, because it is the one the user means by "my
  // brainstem"; a twin is a child of it.
  r = await detectBurrow(answering([7071, 7082]), { timeoutMs: 50 });
  eq('parent preferred over twin when both answer', r.port, 7071);

  // ── 4. THE TRAP: blocked must never masquerade as unburrowed ────────────────
  // If the browser refuses to dispatch the probe, we learned nothing. Collapsing
  // that into "no brainstem" would tell a user with a live GOD layer that they
  // have none, and would send them off to re-burrow something already running.
  r = await detectBurrow(mixedContentBlock, { timeoutMs: 50 });
  eq('mixed-content refusal -> blocked, NOT unburrowed', r.state, 'blocked');
  eq('  blocked is explicitly UNCERTAIN', r.certain, false);
  eq('  blocked still degrades (fails closed)', r.degrade, true);
  check('  blocked still offers a door to try', !!r.door, 'no door offered');
  check('  blocked says we learned nothing',
        /nothing was learned/i.test(r.reason), r.reason);

  r = await detectBurrow(pnaBlock, { timeoutMs: 50 });
  eq('private-network refusal -> blocked', r.state, 'blocked');

  // ── 5. A stall is not a refusal ─────────────────────────────────────────────
  // Loopback refuses in ~3ms; a live grail answered in ~236ms. So an expired
  // deadline is a MISSING VERDICT, not an observed absence. A headless run with a
  // compressed clock proved why this matters: every timer fired instantly, and the
  // page confidently told a machine with a live brainstem that it had none.
  r = await detectBurrow(hangs, { timeoutMs: 40 });
  eq('a hanging port -> unburrowed', r.state, 'unburrowed');
  eq('  but NOT certain (timeout != refusal)', r.certain, false);
  eq('  still degrades (fails closed)', r.degrade, true);
  check('  offers the door anyway', !!r.door, 'no door on an inconclusive probe');
  check('  says it was inconclusive', /not conclusive/i.test(r.reason), r.reason);

  // A genuine refusal on every port stays certain — that IS a real observation.
  r = await detectBurrow(refused, { timeoutMs: 50 });
  eq('refused everywhere stays certain', r.certain, true);

  // A slow-but-live brainstem must still be found when the deadline allows.
  var slow = function () {
    return new Promise(function (res) { setTimeout(function () { res({ type: 'opaque' }); }, 60); });
  };
  r = await detectBurrow(slow, { timeoutMs: 500 });
  eq('a slow brainstem inside the deadline -> burrowed', r.state, 'burrowed');

  // ── 6. One live port among blocked ones still wins ──────────────────────────
  // A positive sighting beats a policy refusal: we SAW a brainstem.
  const mixed = (url) => (String(url).includes(':7071/') ? mixedContentBlock() : answering([7082])(url));
  r = await detectBurrow(mixed, { timeoutMs: 50 });
  eq('a real sighting outranks a blocked probe', r.state, 'burrowed');
  eq('  and points at the one that answered', r.port, 7082);

  // ── 7. classifyFailure ──────────────────────────────────────────────────────
  eq('plain TypeError is silence', classifyFailure(new TypeError('Failed to fetch')), 'silent');
  eq('SecurityError is a block', classifyFailure(new Error('SecurityError')), 'blocked');
  eq('null is silence, not a crash', classifyFailure(null), 'silent');

  // ── 8. The request the BROWSER actually gets ────────────────────────────────
  // Inspect the real init object rather than the source text. This is the class of
  // bug that a fake fetch cannot catch by shape alone: node's undici accepts
  // no-cors + redirect:'manual' and resolves, while the fetch spec requires a
  // no-cors request to use redirect 'follow' and browsers throw TypeError on the
  // pair. It shipped past 29 green unit tests and only fell over in real Chrome,
  // where it turned every probe into false silence.
  let seenInit = null, seenUrl = null;
  await detectBurrow((url, init) => { seenUrl = url; seenInit = init; return Promise.reject(new TypeError('x')); },
                     { ports: [7071], timeoutMs: 50 });
  eq('probes loopback by IP literal', seenUrl, 'http://127.0.0.1:7071/health');
  eq('  mode is no-cors', seenInit.mode, 'no-cors');
  eq('  method is GET (never an unsafe verb)', seenInit.method, 'GET');
  eq('  credentials omitted', seenInit.credentials, 'omit');
  check('  redirect is NOT manual — fatal with no-cors in browsers',
        seenInit.redirect === undefined || seenInit.redirect === 'follow',
        'redirect=' + seenInit.redirect + ' is invalid alongside no-cors');
  check('  no custom headers (would force a preflight the grail cannot answer)',
        !seenInit.headers, 'headers were set: ' + JSON.stringify(seenInit.headers));
  check('  no body', !seenInit.body, 'a body was sent');

  // ── 9. The page must never become a GOD data path ───────────────────────────
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'burrow.js'), 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  check('probe never reads a response body',
        !/\.json\(\)|\.text\(\)/.test(code), 'burrow.js parses a response body');
  check('probe stays opaque (no-cors)', /mode:\s*'no-cors'/.test(code), 'no-cors mode missing');
  check('page never handles the brainstem secret',
        !/X-Brainstem-Secret/i.test(code), 'secret referenced outside comments');

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
