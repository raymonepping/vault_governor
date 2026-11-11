# Changelog

## 0.1.0 (2026-11-11)

- A seal Vault and a three-node Vault Enterprise 2.2.1 Raft cluster with
  Transit auto-unseal, scoped tool tokens and no root token after bootstrap.
- Namespace `governor`: userpass, KV v2, Transit; ACL policies with a Control
  Group factor (2 of 3 from `governor-keyholders`) on the break-glass read
  and on the signing key's algorithm change; Sentinel EGPs for the ticket
  and the approved target; the root Control Group config (15 minutes).
- A SCIM client (`governor-hr`) that owns the keyholders and their group,
  reconciled from `config/roster.json` (`make roster`).
- The console (Node 24 API, React 19, Vault daylight glass): The Rule and
  three chapters, the Ledger from three audit logs, Layers.
- `make probe` (83 cases), `make rehearsal` (50), `make verify` (72),
  `make boundary` (66), `make test-ui` (24 with axe), 52 unit tests.
- `make up` and `make down` work from the Lab Index (`RUNTIME=podman`); `make
  up` builds the lab on its first run.
