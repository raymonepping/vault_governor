# Operations

Every operation is a `make` target; `make help` lists them all.

## Start, stop, check

| Situation | Command |
| --- | --- |
| First run | `make env-init`, put `VAULT_LICENSE` in `.env`, `make license && make lab` |
| Daily start, or the Lab Index's Start | `make up` (`RUNTIME=podman` is accepted; anything else stops) |
| Stop, or the Lab Index's Stop | `make down` (containers stop, volumes stay) |
| Five minutes before a talk | `make show-ready` |
| After a rehearsal or a show | `make stage-reset CONFIRM=yes` |
| Something looks wrong | `make doctor` (read-only; names the fix) |
| Full check | `make verify` (includes `make rehearsal`), `make test-ui` |

`make up` installs the licence from `.env` when it is missing (or stops with
the instruction), runs `make lab` on a lab that was never built, and
otherwise brings back vault-s, vault-1..3, the people's tokens (re-minted
only when expired) and the app. It never asks a question: the Lab Index runs
it with stdin closed.

## Reset what a show changes

`make stage-reset CONFIRM=yes`: `make roster` (the HR roster back, so a
removed or deactivated keyholder returns), the key `release-signing` deleted
and created again at v1 ECDSA, the baseline signed again. The break-glass
value stays. Held requests are not cancelled (Vault has no cancel); they
expire after the Control Group `max_ttl` (15 minutes).

## Tokens and passwords

| What | File (0600) | Renewal |
| --- | --- | --- |
| Tool tokens `tf-*`, `ansible-*` | `.secrets/vault/tokens/` | periodic, renewed on every use |
| Seal tokens | `.secrets/vault/seal/vault-N` | `make seal-token-status`, `make seal-token-rotate NODE=` |
| SCIM token (`governor-hr`) | `.secrets/vault/tokens/scim-hr` | not renewable; `make people` re-mints it with less than a week left |
| Console token (`gov-console`) | `.secrets/vault/tokens/console` | periodic 24h, the API renews it hourly; `make people` re-mints an expired one |
| People's passwords | `.secrets/people/<user>` | created once; `make people-copy-password U=rowan` copies, never prints |

## Bootstrap policies

`vault/policies/bootstrap/*.hcl` are written with the init root token, which
is then revoked. To change one: `make root-regen CLUSTER=vault`, then
`VGOV_ROOT_FILE=.secrets/vault/root-vault scripts/ansible.sh bootstrap`, then
`make root-revoke CLUSTER=vault`, and record the use in `docs/STATE.md`. On a
young lab with nothing to keep, `make clean-slate` and `make lab` do the
same without a root token.

## Backup and starting over

- `make backup`: Raft snapshots of vault-s and the cluster, and the secrets,
  into `backups/<time>/`.
- `make clean-slate` (type DELETE): removes every `vgov-` container and
  volume, moves credentials to `.secrets/legacy/<time>/`; keeps the CA, the
  licence and the images. Then `make lab`.

## Measuring Vault again

`make probe` runs 83 cases in a scratch namespace on the 4h probe token that
bootstrap mints, and rewrites `docs/capabilities.md`. After four hours the
probe token is gone: re-mint it with the root-regen cycle above.
