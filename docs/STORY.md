# The Second Key

*Terraform writes the rule; Vault makes the people follow it.*

A presenter-driven lab in three chapters. Every moment the audience sees is
a real Vault Enterprise 2.2.1 decision, shown verbatim. The setting is
fiction: **Kestrel Harbour Authority**, a port that runs its lock gates from
one control system.

## People

| Person | Role | Comes from | May |
| --- | --- | --- | --- |
| Rowan Hale (`rowan`) | Duty engineer, the requestor | userpass | Ask for the recovery code and for a key change; sign releases |
| Ines Varga (`ines`) | Harbour master, keyholder | SCIM (HR) | Approve |
| Kofi Mensah (`kofi`) | Chief of lock operations, keyholder | SCIM (HR) | Approve |
| Mara Lindqvist (`mara`) | Head of control systems, keyholder | SCIM (HR) | Approve, until she leaves |
| Jonas Reyes (`jonas`) | Visiting contractor | userpass | Press "approve", without it counting |

Who may approve is decided by one thing: membership of the group
`governor-keyholders`, which the HR system (a SCIM client) owns.

## Prologue: The Rule

Before anything runs, the audience reads the rule: the namespace, the
protected paths, the keyholder group, "two approvals", and the Sentinel
policies with their enforcement level, straight from the Terraform code.
Nothing is global; each person's capabilities are shown.

## Chapter I: The Second Key

Rowan needs the lock-gate recovery code at night. Without an incident ticket,
a Sentinel policy refuses the read. With one, Vault does not return the code:
it holds the request and hands back a receipt. Ines approves; the request is
still held. Jonas, who has the approve button but is not a keyholder, tries;
it does not count. Kofi approves; Rowan opens the code, once.

## Chapter II: The Algorithm's Second Key

The release-signing key is about to change its nature, from ECDSA P-256 to
the post-quantum ML-DSA. The change goes through the same two keyholders. One
approval leaves the key unchanged; two make version 2 ML-DSA. The release
manifest is signed again, and both the old and the new signature are checked.
A request for any other algorithm is refused by policy before anyone is asked.

## Chapter III: The Keyholder Who Left

A request waits with one approval. Mara leaves the harbour: HR removes her
from the keyholders through SCIM. What can she still do? Her old token, a new
login, an approval on the waiting request, an approval on a new one: the lab
measures each and shows Vault's answer. Kofi completes the request.

## Epilogue: The Ledger

The night replayed from the audit log: every request, refusal, approval,
release, key change and roster change, with who did it.

## What it proves, and what it only illustrates

**Proves:** a held request needs two distinct members of a named group; one
is not enough; someone outside the group cannot help; a policy can refuse a
request before any approval; a key's algorithm change can go through the same
approval and keep old signatures verifiable; the roster Vault evaluates
follows SCIM; the audit log holds the whole story.

**Illustrates only:** one local SCIM client is not an enterprise identity
platform; one presenter plays several people (the stage-hand shortcut); the
harbour, the people and the recovery code are invented; one Mac is not
production.
