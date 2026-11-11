# Security model

What this lab trusts, where the boundaries are, and the shortcuts it takes
on purpose. Everything here is a local lab on one Mac.

## Boundaries

| Boundary | Enforced by | Proved by |
| --- | --- | --- |
| No root token after bootstrap | `vault_init` role revokes it and strips it from the init files | `make verify` (vault), `make doctor` |
| Each tool does its own job | bootstrap policies; none can write its own `vgov-*` policy | `make boundary` (tool rows) |
| Terraform cannot read the value, sign, approve or touch SCIM users | `vgov-tf-platform` denies them | `make boundary` |
| Ansible writes the value and never reads it; cannot change the key's algorithm or approve | `vgov-ansible-platform` | `make boundary` |
| The requestor cannot approve | `gov-requestor` has no `sys/control-group/authorize` | `make rehearsal` R12 |
| Approval counts only from `governor-keyholders` | the Control Group factor | `make rehearsal` R11, R36 |
| A read needs a ticket; the key may only become ML-DSA-65 | EGPs, `hard-mandatory` | `make rehearsal` R4, R5, R17 to R19 |
| The SCIM client manages only its own users and group, only through SCIM | SCIM token type, `gov-scim`, client ownership | `make rehearsal` R46, R47; `make boundary` |
| The console cannot read the value, approve, sign or change a key | `gov-console` | `make rehearsal` R48, R49; `make boundary` |
| Browser to API | session cookie (HttpOnly, Secure, SameSite=Strict), cross-site and foreign-origin writes refused, sign-in limited to 10 a minute for the console (every sign-in arrives from nginx, so one bucket) | `make rehearsal` R2, R3; `make test-ui` |

## Shortcuts, on purpose

- **The stage hand (D11).** One presenter plays five people. The presenter
  signs in as `rowan`; the API holds the passwords of `ines`, `kofi`,
  `mara` and `jonas` (read-only mounts) and logs each in with their own
  password for their actions, so Vault sees distinct entities. In a real
  deployment each keyholder signs in for themselves. The API keeps a
  keyholder's token for its TTL (1 hour): Vault forgets an approval when the
  approver's token is revoked (probe P27).
- **One local SCIM client.** `scripts/roster.js` and the API play the HR
  system. It shows Vault's SCIM server behaviour; it does not prove an
  integration with an identity platform.
- **The ledger's chapter guess.** The audit log names no accessor for a held
  request, so the ledger gives each approval to the latest held request
  without one. Right while one request is played at a time.

## Headers

The console sends a Content-Security-Policy without inline scripts or
styles, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
It sends **no** `Strict-Transport-Security`, on purpose: HSTS for
`localhost` would make the browser force https on every localhost port, and
the other labs on this Mac serve plain http. The console listens on
127.0.0.1 only.

## What is synthetic

The harbour, the five people, the recovery code `KESTREL-...` and the
release manifest are invented. No real person's data and no real
credential is in this repository; gitleaks runs in CI and in
`make secret-scan`.

## Secrets on disk

`.env` (the licence), `.secrets/` (init files, tokens, passwords, Terraform
state) and `.build/` are never committed. Every secret file is 0600. Scripts
pass token file paths, never tokens, on command lines; passwords go to Vault
in request bodies read from their files.
