# Architecture

> **Terraform builds the house. Ansible decorates it. Vault keeps the keys.
> Make is the front door.**

```text
network vgov-internal                          every Vault listener: TLS 1.3, lab CA
 ├─ seal:  vault-s (Shamir 1/1, Raft) ── Transit key autounseal, token role autounseal
 ├─ vault: vault-1..3 (Raft, seal "transit"), file audit device per node (root namespace)
 │           namespace governor/:
 │             userpass/      rowan, jonas (userpass), ines, kofi, mara (SCIM-provisioned)
 │             kv/            breakglass/lock-gates (the synthetic recovery code)
 │             transit/       release-signing (ecdsa-p256 v1, ml-dsa v2 after chapter II)
 │             policies       gov-requestor (Control Group factor x2), gov-keyholder,
 │                            gov-console, gov-scim
 │             EGPs           gov-breakglass-ticket, gov-algorithm-target (hard-mandatory)
 │             SCIM client    governor-hr: users and the group governor-keyholders
 ├─ app:   api (Node 24, :13900) ── web (nginx, TLS 1.3, :13901)
 ├─ Terraform: vault-seal (tf-seal) │ vault-platform (tf-platform)
 ├─ Ansible:   localhost → Vault HTTPS API (ansible-seal, ansible-platform)
 └─ SCIM:      scripts/roster.js and the API → identity/scim/v2 (the SCIM token)
```

## The phases (`scripts/phases.txt`)

| # | Phase | Tool | Does |
| --- | --- | --- | --- |
| 1 | `seal-up` | make | vault-s up |
| 2 | `seal-init` | ansible | init and unseal vault-s, seal bootstrap policies and tokens, revoke root |
| 3 | `vault-seal` | tf | Transit key `autounseal`, token role, audit on vault-s |
| 4 | `seal-tokens` | ansible | one seal token per node |
| 5 | `vault-up` | make | vault-1..3, auto-unseal, a leader |
| 6 | `bootstrap` | ansible | init the cluster, three voters, platform bootstrap policies and tokens, the 4h probe token, revoke root |
| 7 | `vault-platform` | tf | audit, namespace, mounts, policies, EGPs, Control Group config, the SCIM client's identity and config |
| 8 | `people` | ansible | passwords, userpass users, the SCIM token, the console token |
| 9 | `roster` | make | the SCIM client provisions the keyholders and their group |
| 10 | `stage` | ansible | the break-glass value, `release-signing` at v1, the signed baseline |
| 11 | `app-up` | make | api and web |
| 12 | `validate` | ansible | every person signs in; keyholders are the SCIM entities |

Then the gates: idempotency (every Ansible phase and the roster
`changed=0`), drift (every plan empty), the secret scan, the boundary. From
nothing to green: about two minutes (`docs/STATE.md`).

## A request, end to end

1. The presenter signs in as `rowan` on the console; the API logs rowan in
   (userpass) and keeps the token server side.
2. Rowan's read of `kv/data/breakglass/lock-gates?ticket=HAR-0417`: the EGP
   reads `request.data.ticket`; the Control Group factor holds the response
   and returns a wrapping accessor.
3. A keyholder's approval: the API logs that person in with their own
   password and calls `sys/control-group/authorize`. Vault counts it only
   if their entity is in `governor-keyholders` when it checks.
4. Rowan's `sys/wrapping/unwrap` releases the value once.
5. The API reads the three audit logs and shows the night on the Ledger.

The API's own token (`gov-console`) only reads: key metadata and public keys,
the keyholder group, held requests, the rules. It cannot read the value,
approve, sign or change anything.
