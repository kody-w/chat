// burrow.js — decide whether a GOD-layer brainstem is burrowed on this device.
//
// This file is BONES. It is served publicly from GitHub Pages and contains no
// secret, no memory, and no vault. Its only job is to answer one question:
//
//     is there a brainstem running on this device right now?
//
// and to be honest when it cannot tell.
//
// ── Why we probe instead of just calling ──────────────────────────────────────
// The grail brainstem is deliberately unreachable from a public page:
//
//   CORS(app, origins=/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/)
//   @app.route("/health") @_require_secret
//   _reject_cross_origin_unsafe_request -> 403 without X-Brainstem-Secret
//
// Verified against a live grail (v0.6.16):
//
//   GET  /health   Origin: https://kody-w.github.io   -> 403, no ACAO header
//   POST /chat     Origin: https://kody-w.github.io   -> 403
//
// That is CORRECT and we do not try to defeat it. It is the guard that stops any
// website on the internet from scripting your brainstem inside your own browser.
// The page never asks for the secret, never holds one, and never proxies GOD.
//
// So we never READ the brainstem from here. We only listen for whether something
// is THERE, using an opaque `no-cors` request whose body and status we cannot
// see and do not want:
//
//   something listening  -> fetch RESOLVES (opaque; 200/403/404 all look alike)
//   nothing listening    -> fetch REJECTS  (connection refused)
//
// A 403 is an answer. Silence is not. That distinction is the whole detector.
//
// ── The three states, and the one that is usually wrong ───────────────────────
//   'burrowed'    a brainstem answered. The GOD layer is live on this device.
//   'unburrowed'  nothing answered. THIS IS THE DEFAULT AND IT IS NORMAL
//                 — burrowing a grail brainstem needs extra user permissions, so
//                 most visits will land here. It is not an error and must never
//                 be rendered as one. Carries `certain: false` when a probe timed
//                 out rather than being refused, because loopback refuses in ~3ms
//                 and a live brainstem answers in ~236ms — an expired deadline is
//                 a missing verdict, not an observed absence.
//   'blocked'     the browser refused to let us look at all (mixed content or
//                 Private Network Access). We learned NOTHING. Reporting this as
//                 a confident 'unburrowed' would be a lie: it would tell someone
//                 with a live brainstem that they have none.

'use strict';

// 7071 is the parent brainstem. Booted twins take 7081+. Probing a small fixed
// set keeps this bounded and predictable; it is not a port scan.
const DEFAULT_PORTS = [7071, 7081, 7082, 7083];
const DEFAULT_TIMEOUT_MS = 1500;

// Loopback is a "potentially trustworthy" origin, so https -> http://127.0.0.1 is
// exempt from mixed-content blocking in Chrome and Firefox. Safari is stricter and
// Chrome's Private Network Access can require a preflight the grail does not
// answer. Both failure modes surface as 'blocked', never as 'unburrowed'.
function probeUrl(port) {
  return 'http://127.0.0.1:' + port + '/health';
}

function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(onTimeout); }
    }, ms);
    promise.then(
      (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
      (e) => { if (!settled) { settled = true; clearTimeout(timer); resolve(e); } }
    );
  });
}

// A rejected cross-origin fetch cannot tell us WHY it failed — the browser
// deliberately collapses "refused", "blocked", and "DNS failed" into one opaque
// TypeError so a page cannot use failure timing to map a private network. We can
// still separate the two cases we care about, because a browser that refuses to
// dispatch at all names the policy in the message.
const BLOCKED_HINTS = [
  'mixed content',
  'insecure',
  'private network',
  'not allowed to request',
  'blocked by client',
  'securityerror',
];

function classifyFailure(err) {
  const text = String((err && (err.message || err.name)) || err || '').toLowerCase();
  for (let i = 0; i < BLOCKED_HINTS.length; i++) {
    if (text.indexOf(BLOCKED_HINTS[i]) !== -1) return 'blocked';
  }
  return 'silent';
}

/**
 * Probe one port. Resolves to 'answered' | 'silent' | 'blocked'.
 * Never throws, never reads a response body.
 */
async function probePort(fetchImpl, port, timeoutMs) {
  const result = await withTimeout(
    (async () => {
      // mode:'no-cors' -> opaque. We cannot read status or body, which is exactly
      // the point: detection must not become a data path.
      //
      // Do NOT add redirect:'manual' here. The fetch spec requires a no-cors
      // request to use redirect mode 'follow' and throws a TypeError otherwise,
      // so the pair is unconditionally fatal in a browser — Chrome 131 returns
      // "TypeError: Failed to fetch" before a packet is sent. Node's undici is
      // lenient and resolves it happily, so this only ever surfaced under a real
      // browser, where it made every probe look like silence and reported this
      // machine's live brainstem as absent.
      await fetchImpl(probeUrl(port), {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
      });
      return 'answered';
    })(),
    timeoutMs,
    // A timeout is silence, not a block: a listener that accepts and stalls is
    // indistinguishable from no listener, and claiming 'blocked' would overstate
    // what we know.
    new Error('timeout')
  );

  if (result === 'answered') return 'answered';
  // A timeout is NOT silence. Measured against a live grail on this machine:
  // a refused loopback connection rejects in ~3ms, while a real brainstem
  // answered in ~236ms. So a probe still unresolved at the deadline means the
  // network never gave a verdict — a throttled background tab, a loaded device,
  // a brainstem mid-boot. Calling that 'unburrowed' with confidence is the same
  // lie the 'blocked' state exists to prevent, just arriving through another
  // door. A headless run with a compressed clock did exactly that: it reported
  // this machine's live brainstem as absent, and sounded certain about it.
  if (result instanceof Error && result.message === 'timeout') return 'timeout';
  return classifyFailure(result);
}

/**
 * Detect whether a GOD-layer brainstem is burrowed on this device.
 *
 * @returns {Promise<{state:'burrowed'|'unburrowed'|'blocked', port:number|null,
 *                    door:string|null, degrade:boolean, certain:boolean,
 *                    reason:string}>}
 *
 * `degrade` is true unless we positively found a brainstem — failing closed, so a
 * detector that cannot see never grants GOD-layer affordances.
 * `certain` is false for 'blocked', and callers must soften their wording when it
 * is false rather than asserting an absence they did not observe.
 */
async function detectBurrow(fetchImpl, options) {
  const opts = options || {};
  const ports = opts.ports || DEFAULT_PORTS;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  const outcomes = await Promise.all(
    ports.map((p) => probePort(fetchImpl, p, timeoutMs))
  );

  for (let i = 0; i < ports.length; i++) {
    if (outcomes[i] === 'answered') {
      return {
        state: 'burrowed',
        port: ports[i],
        // The door is the whole design. We do not proxy GOD through this page —
        // we hand the user to the origin the brainstem itself serves, where the
        // same bones run same-origin and every guard above is satisfied without
        // a single exception being made for us.
        door: 'http://localhost:' + ports[i] + '/',
        degrade: false,
        certain: true,
        reason: 'A brainstem answered on 127.0.0.1:' + ports[i] + '.',
      };
    }
  }

  if (outcomes.indexOf('blocked') !== -1) {
    return {
      state: 'blocked',
      port: null,
      door: 'http://localhost:' + ports[0] + '/',
      degrade: true,
      certain: false,
      reason: 'This browser blocked the loopback probe, so nothing was learned '
            + 'about whether a brainstem is running.',
    };
  }

  // No answer, no block, but at least one probe never came back. Loopback either
  // answers or refuses almost immediately, so an expired deadline is a missing
  // verdict rather than an absence. We still degrade — failing closed — but we
  // must not claim to have observed an empty device.
  if (outcomes.indexOf('timeout') !== -1) {
    return {
      state: 'unburrowed',
      port: null,
      door: 'http://localhost:' + ports[0] + '/',
      degrade: true,
      certain: false,
      reason: 'No brainstem answered in time. The probe timed out rather than '
            + 'being refused, so this is not conclusive.',
    };
  }

  return {
    state: 'unburrowed',
    port: null,
    door: null,
    degrade: true,
    certain: true,
    reason: 'No brainstem answered. This is the default: burrowing one needs '
          + 'extra permissions on this device.',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectBurrow, probePort, classifyFailure, DEFAULT_PORTS };
}
if (typeof window !== 'undefined') {
  window.RappBurrow = { detectBurrow, DEFAULT_PORTS };
}
