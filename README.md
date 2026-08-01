# chat

**Public bones for a local-first brainstem.** Live at
**<https://kody-w.github.io/chat/>**

You can always reach this page. It never holds anything of yours.

---

## What it is

GitHub Pages serves the **bones** — layout, wiring, and a probe. Your **GOD layer**
— the brainstem and `~/.rapp/twin` — stays on your device and never travels. The
page's entire job is to work out which of those two exist right now and say so
truthfully.

| | DOG · bones | GOD · bones + vault |
|---|---|---|
| where | this page, GitHub Pages | your device |
| holds | layout, wiring, the probe | memory, twin, keys |
| public | yes, by design | never |

Per Article LVI, GOD contains DOG — the vault is the part that does not travel,
not a separate thing.

---

## Degraded is the *default*

A grail brainstem is not running unless you burrowed one, and burrowing takes extra
permission on the device. So the normal state of this page is degraded. That is a
resting state, not a failure, and the UI says so in those words.

Three states, and the third is the one that matters:

| state | meaning | degrades? | certain? |
|---|---|---|---|
| `burrowed` | a brainstem answered | no | yes |
| `unburrowed` | nothing answered — **the default** | yes | yes |
| `blocked` | the browser refused to let us look | yes | **no** |

`blocked` exists for one reason: if the browser blocks the probe, we learned
*nothing*. Reporting that as `unburrowed` would tell someone with a live brainstem
that they have none, and send them to re-burrow something already running. So it
stays its own state, the copy softens to "can't tell from here", and the door is
offered anyway.

---

## How the probe works, and what it refuses to do

Your brainstem is deliberately unreachable from a public page. Verified against a
live grail (v0.6.16):

```
GET  /health   Origin: https://kody-w.github.io   ->  403, no ACAO header
POST /chat     Origin: https://kody-w.github.io   ->  403
```

That is the guard that stops any website on the internet from scripting your
brainstem inside your own browser — and this page is a website. So it does not ask
for an exception. It never requests your `X-Brainstem-Secret`, never proxies, and
**never reads a byte of a response**:

```js
fetch('http://127.0.0.1:7071/health', { mode: 'no-cors', credentials: 'omit' })
```

`no-cors` makes the response opaque. The page cannot see the status or the body,
which is the point — detection must not quietly become a data path. All it learns
is whether *something answered*:

- something listening → the fetch **resolves** (200, 403, 404 all look identical)
- nothing listening → the fetch **rejects**

**A 403 is an answer. Silence is not.** That single distinction is the detector.
It is also what the original `checkHealth()` got wrong: it called `r.json()` on the
response, which throws on a 403 body, landing in `catch()` — reporting a live
brainstem as absent.

Ports probed: `7071` (parent), `7081-7083` (booted twins). Parent wins when both
answer. A positive sighting always outranks a blocked probe.

### Browser support

Loopback is a "potentially trustworthy" origin, so an `https` page reaching
`http://127.0.0.1` is exempt from mixed-content blocking. **Verified end-to-end in
Chrome 131**: the live `https://kody-w.github.io/chat/` detects a brainstem on
`127.0.0.1:7071` and offers the door.

Safari is stricter about loopback, and Chrome's Private Network Access may
eventually require a preflight the grail does not answer. Neither is verified here,
and both surface as `blocked` rather than a false `unburrowed` — the page says
"can't tell from here" and offers the door anyway. That is the whole reason the
third state exists.

---

## The door

When a brainstem is found, the page does not talk to it. It hands you through to
`http://localhost:<port>/`, where your brainstem serves the same bones itself —
same-origin, every guard satisfied, full GOD layer live, no exception made for
anyone.

That is the whole architecture: **the public copy is a signpost, not a bridge.**

---

## Installed, and offline

It is a PWA, so you can keep it on a home screen. The service worker caches the
bones — which matters most in the case this page exists for: **your brainstem is
running and the thing that is unreachable is GitHub, not you.** An installed copy
still boots and still hands you through to localhost.

The worker refuses to touch the probe. It is a cross-origin request and goes
straight to the network, uncached — a cache in front of a *liveness* check would
replay a stale "yes" and keep reporting a brainstem that stopped running an hour
ago. That one line is the most important thing in `sw.js`.

## When nothing is burrowed

There is no secure AI to offer from a public page — holding credentials here is
exactly what this design avoids. So degraded mode points at
[vbrainstem](https://kody-w.github.io/vbrainstem/), which already owns the
browser-only path and its Copilot sign-in. One owner for browser-held
credentials, not two.

## Burrow one

```bash
curl -fsSL https://kody-w.github.io/rapp-installer/install.sh | bash
open http://localhost:7071/
```

---

## Tests

```bash
node tests/test_burrow.js     # 40 checks — the detector
node tests/test_sw.js         # 14 checks — the offline shell
```

Each guard has been mutation-tested — the bug it prevents was injected and the
suite was confirmed to fail. Collapsing `blocked` into `unburrowed` fails 5 checks;
reading a response body fails 11; restoring `redirect:'manual'` fails 1; letting
the service worker cache the probe fails 3.

---

## Related

- [rapp-constitution](https://kody-w.github.io/rapp-constitution/) — Article LVI, the DOG/GOD membrane
- [rapp-mapp](https://kody-w.github.io/rapp-mapp/) — the RAPPDEX
- [vbrainstem](https://kody-w.github.io/vbrainstem/) — the full browser brainstem UI
