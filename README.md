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

---

## The door

When a brainstem is found, the page does not talk to it. It hands you through to
`http://localhost:<port>/`, where your brainstem serves the same bones itself —
same-origin, every guard satisfied, full GOD layer live, no exception made for
anyone.

That is the whole architecture: **the public copy is a signpost, not a bridge.**

---

## Burrow one

```bash
curl -fsSL https://kody-w.github.io/rapp-installer/install.sh | bash
open http://localhost:7071/
```

---

## Tests

```bash
node tests/test_burrow.js     # 29 checks
```

Each guard has been mutation-tested — the bug it prevents was injected and the
suite was confirmed to fail. Collapsing `blocked` into `unburrowed` fails 5 checks;
reading a response body fails 11.

---

## Related

- [rapp-constitution](https://kody-w.github.io/rapp-constitution/) — Article LVI, the DOG/GOD membrane
- [rapp-mapp](https://kody-w.github.io/rapp-mapp/) — the RAPPDEX
- [vbrainstem](https://kody-w.github.io/vbrainstem/) — the full browser brainstem UI
