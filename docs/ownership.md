# Ownership

Who owns each object. Two owners never manage the same object.

| Object | Owner | Why |
| --- | --- | --- |
| Seal Transit key, token role `autounseal`, vault-s audit | Terraform `vault-seal` | declared structure |
| Seal tokens per node | Ansible `seal-tokens` | minted at a moment |
| Audit device `file/` on the cluster (root namespace) | Terraform `vault-platform` | audit devices are root only (probe P26) |
| Namespace `governor`; userpass, kv, transit mounts | Terraform | declared structure |
| ACL policies `gov-*` with the Control Group factors | Terraform | the rule, versioned |
| EGPs `gov-breakglass-ticket`, `gov-algorithm-target` | Terraform (source in `vault/sentinel/`) | the rule, versioned |
| Control Group `max_ttl` (root `sys/config/control-group`) | Terraform | only the root config applies (probe P10) |
| Entity `scim-hr`, its alias, token roles `scim-hr` and `gov-console`, SCIM client `governor-hr` | Terraform | the SCIM client's boundaries |
| Userpass users and passwords (all five people) | Ansible `people` | passwords stay out of Terraform state |
| SCIM and console tokens | Ansible `people` | minted at a moment, re-minted when expired |
| Users `ines`, `kofi`, `mara` and the group `governor-keyholders` | the SCIM client (`config/roster.json`, `make roster`) | HR is the source; Vault refuses identity API writes to SCIM-owned fields |
| Entities of `rowan` and `jonas` | Vault (created at first login) | not on the HR roster |
| The break-glass value | Ansible `stage` | runtime; never in Terraform state |
| Transit key `release-signing` | Ansible `stage` (chapter II changes it, `stage-reset` restores it) | its algorithm changes on purpose |
| The baseline signature and manifest bytes (`.build/stage/`) | Ansible `stage` | synthetic evidence |
| Every decision (held, approved, refused, released) | Vault | never simulated; the console shows Vault's answer |
