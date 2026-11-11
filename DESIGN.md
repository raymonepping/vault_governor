# DESIGN.md: vault_governor console

The console follows **Vault daylight glass**, the house system for every Vault
project (canonical implementation: Arcanium; contract: the `vault-ui-design`
skill). Light frosted panes, black ink, one dark ink hero per page, strong
status colours that hold WCAG AA. This file states only what vault_governor
adds or decides on top of it.

## Stack

- React 19 + Vite 8 + Tailwind v4 (`web/`), served by nginx over TLS 1.3 with
  the lab CA's listener certificate (`make gen-certs`).
- `web/src/styles/vault-glass.css` is the skill's file, unchanged;
  `shell.css` is vault_codex's copy (labels visually hidden below 1180 px, so
  accessible names match). Shared layout in `web/src/styles/app.css`; the
  console's own pieces (actor chips, outcomes, key slots, policy source,
  ledger, layers) in `web/src/styles/story.css`, tokens only.
- Fonts: Hanken Grotesk Variable and JetBrains Mono Variable via
  `@fontsource-variable`, bundled, no external requests.
- Icons: `lucide-react`. No emoji.
- CSP `style-src 'self'` and `script-src 'self'`: no inline styles or scripts.

## Governor

- **Vault's answer first.** Every step shows an outcome: a status pill
  (allowed, held, refused with the HTTP status), the **actor chip** (whose
  Vault token made the call, D11), Vault's errors verbatim, and a "Vault
  said" fold with the call, node and request id. A wink may follow; it never
  replaces the answer.
- **Held is amber, refused is red, allowed is green.** Blue is identity and
  links. A refused outcome gets a faint red wash, never a coloured rail.
- **Key slots.** Two keyholes per held request. They fill from Vault's own
  word: all of them when `sys/control-group/request` says `approved`, one per
  approver who is in `governor-keyholders` before that. Each listed approver
  says whether they are in the group: Jonas, and Mara after she leaves, are
  listed and marked "not in governor-keyholders". The console never counts.
- **One ink pane per page:** the hero carries the chapter, the situation and,
  in chapter I, the released recovery code (synthetic).
- **Presenter type:** hero titles 32 px, readable from the back of a room at
  1440x900; tables scroll inside a focusable, named region on a phone.
- **Motion:** the keyholes fill (180 ms), the ledger draws itself; nothing
  else moves, and nothing moves under `prefers-reduced-motion`.

## Pages

| Page | Shows |
| --- | --- |
| The harbour | the setting, the three chapters, the people and where each comes from |
| The Rule | each person's capabilities on the protected paths (their own token), the ACL policies and EGPs as Vault returns them |
| I. The Second Key | the break-glass read: refused without a ticket, held, approvals, release, a second release refused |
| II. The Algorithm's Key | key versions, the v1 baseline, a forbidden target, the held change, two approvals, both signatures verified by Vault and by the lab's verifier |
| III. The Keyholder Who Left | the SCIM roster, a waiting request, offboarding (group removal or `active=false`), what the leaver can still do, the remaining council, HR's reconcile |
| Epilogue: The Ledger | the audit logs of three nodes, merged, filtered by person and chapter |
| Layers | every phase of `make lab` with its tool and evidence, and the gates |

The presenter signs in as `rowan` on the console's own form; ←/→ moves
between pages, `?` lists the keys.

## Verification

`make test-ui` (Playwright, 24 tests): axe WCAG 2.1 AA with zero violations
on every page at 1440x900 and 390x844 and on the signed-out form, TLS and
CSP, no break-glass value in any bundle or in `/api/story`, a foreign-origin
write refused, and the three chapters and the ledger played end to end
against the live stack. `make screenshots` refreshes `docs/screenshots/`.
