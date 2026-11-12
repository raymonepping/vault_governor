# State

What was built, deferred and learned, per prompt. Read this first.

## Prompt 01: Foundation (2026-11-11)

**Built.** The skeleton, copied from `../vault_codex` (HEAD `46aa5f2`) and
renamed `vcdx`→`vgov`, `VCDX`→`VGOV`, ports 19000s→19400s and
13700s→13900s:

- `Makefile` with every target of the plan (later prompts' targets answer
  "not built yet" until their script lands), `RUNTIME ?= podman` with a
  guard that stops on any other value (the Lab Index passes
  `RUNTIME=podman`).
- `config/defaults.conf` (images, ports, namespace `governor`, Control Group
  TTL 900 s, session idle), `config/story.json` (chapters, people, ticket
  pattern, the synthetic break-glass value and release manifest),
  `config/roster.json` (the HR source of the SCIM client).
- `scripts/story-check.js` + 7 unit tests.
- Wrappers: `common.sh` (Keycloak helpers replaced by `person_login`, a
  userpass login that reads the password with `jq --rawfile`), `compose.sh`
  (stacks `seal vault app`), `tf.sh`, `ansible.sh`, `gen-certs.sh`,
  `license.sh`, `ports-check.sh`, `network.sh`, `podman-check.sh`.
- `scripts/phases.txt` with every phase `# pending NN`.
- `.gitignore`, `.env.example`, `.gitleaks.toml`, `.containerignore`,
  `.editorconfig`, `.markdownlint.json`, `.github/`.
- `.claude/CLAUDE.md`, `AGENTS.md`.

Removed from the scaffold: the root `main.tf` (an empty root next to two
real ones confuses `make lint`), `FOLDER_TREE.md`, `sanity_check.md` and
`.dockerignore` (`.containerignore` replaces it). Copied but not used: the
Keycloak identity stack, Transform, the codex acts, rotator and agent were
left out of the copy.

**Checks run.** `make help`; `make help RUNTIME=docker` stops with the
message; `make check` (Podman 6.1.4 / 5.7.1 machine, 46 GiB, VM clock skew
2 s); `make env-init`; `make license` (installed from `.env`, 1412 bytes;
never printed); `make gen-certs` and `make certs-status` (SANs vault-s,
vault-1..3, web, api, governor.localhost, localhost, 127.0.0.1; chain
verifies); `make ports-check` (all six free); `node scripts/story-check.js`;
`node --test scripts/story-check.test.js` (7 pass); `git status
--untracked-files=all` shows none of the private set; the Lab Index's
excluded-runtime words appear nowhere in the Makefile or scripts.

**Versions (2026-11-11).** Terraform 1.14.2, ansible-core 2.21.3, Node
25.2.1 (containers: node:24-alpine), Podman 6.1.4 client / 5.7.1 machine,
vault CLI 2.1.0+ent. Images local and arm64: vault-enterprise:2.2.1-ent,
node:24-alpine, nginx:1.30.0-alpine, alpine:3.24.1.

**Deferred.** Everything that needs Vault (prompts 02 onward). Scripts copied
from codex that later prompts rewrite still carry codex logic until then.

## Prompt 02: Seal and cluster (2026-11-11)

**Built.** vault_codex prompt 02, renamed: vault-s (Shamir 1/1, Raft),
Terraform `vault-seal`, one seal token per node, vault-1..3 (Raft, Transit
auto-unseal), bootstrap with scoped tokens and root revocation. New for
governor:

- `vault/policies/bootstrap/vgov-tf-platform.hcl` and
  `vgov-ansible-platform.hcl` rewritten for namespace `governor`: a
  root-namespace token reaches it through `governor/` paths. Terraform gets
  structure only (namespace, mounts, userpass, policies, EGPs, Control Group
  config, token roles, the SCIM client config); Ansible gets runtime only
  (userpass users, the SCIM and console tokens, the break-glass value
  **write-only**, the signing key without `.../algorithm`). Neither may touch
  SCIM users or groups, approve, or rewrite its own policy.
- `vault/policies/probe.hcl`: everything inside a scratch namespace
  `probe-*` and nothing in `governor` (bootstrap mints it for 4h).
- User lockout bounded for `userpass` on vault-1..3 (5 failures, 60 s);
  vault-s has no people and no lockout block.
- Phase order changed: `people` (mints the SCIM token) now runs before
  `roster`; nobody logs in before `validate`, so SCIM still provisions
  before any first login (D13 holds). `phases.txt` and the Makefile say so.

**Checks run.** Phases 1 to 6 from empty volumes in about 1 minute;
`make vault-status`: 3 voters, one leader, all unsealed, 2.2.1+ent;
`make boundary`: 36 checks pass (tool rows only; persona rows come in 04);
`make vault-down && make vault-up`: back in 21 s with a new leader (vault-2);
second runs of `seal-init`, `seal-tokens`, `bootstrap`: `changed=0`;
`vault-seal` plan: no changes. Root revocation: the `vault_init` role
revokes it (`revoke-self`) and strips `root_token`; `.secrets/` is not
readable from the assistant session, so the file itself was not inspected.

## Prompt 03: Probe (2026-11-11)

**Built.** `scripts/probe.sh` (`make probe`, 81 cases) and
`scripts/probe-lib.sh` (now reads `.data.error` too: Vault puts some
refusals there, not in `errors`). One scratch namespace `probe-<epoch>` with
its own userpass, kv, transit, policies, EGPs, SCIM client and five people,
plus a scratch root audit device; all removed at the end (checked: no
namespace, no audit device, root Control Group config back to absent).
Runs on bootstrap's 4h probe token, never root. Answers and evidence:
`docs/capabilities.md`.

**Run.** `make probe`: 81 passed, 0 failed, 14 s.

**What the probe changed in the brief (`prompts/00_brief.md`).**

- D10: the Control Group TTL goes in the **root** `sys/config/control-group`;
  the namespaced write is accepted and ignored (P10).
- D12: the ticket is a query parameter `?ticket=HAR-....` read as
  `request.data.ticket` (mechanism a; headers and entity metadata not
  needed); the rule governs reads only, so Ansible's write of the value
  passes.
- Chapter II: with the EGP in place, `aes256-gcm96` is refused by the EGP,
  not by Vault's usage rule; Vault's own rule (`incompatible algorithm`) is
  shown as measured evidence instead.
- D14: the console token reads `transit/export/public-key/release-signing/*`
  for the verifier (`GET transit/keys` has no public key for ML-DSA).

**Learned (each in `docs/capabilities.md`).** SCIM tokens must be created
`renewable: false`. Group removal keeps the person's login and token, and
stops every approval from counting, including one given before she left.
`active=false` refuses her old token, a new login and approvals (403). An
outsider's approval is listed but not counted. Node 24.22 verifies Transit
ECDSA P-256 and ML-DSA-65 signatures (the ML-DSA key exports as 1952 raw
bytes; the verifier adds the SPKI header). Audit devices are root only.

## Prompt 04: Platform, roster and people (2026-11-11)

**Built.**

- `terraform/vault-platform` rewritten for governor: `vault_namespace`
  governor and a provider alias for it; in it userpass, kv (v2) and transit;
  policies `gov-requestor` (the Control Group factor on both protected
  paths), `gov-keyholder`, `gov-console`, `gov-scim`
  (`terraform/vault-platform/policies/`); EGPs `gov-breakglass-ticket` and
  `gov-algorithm-target` from `vault/sentinel/`; the root
  `vault_config_control_group` (900 s); the SCIM client's entity, its alias on
  the token mount, token roles `scim-hr` (not renewable) and `gov-console`
  (periodic 24h); the SCIM client itself with **`vault_scim_client`**
  (provider 5.13.0 has it; no `vault_generic_endpoint` needed). The token
  mount's data source waits for the namespace (`depends_on`): on a first run
  it does not exist at plan time.
- `ansible/people.yml` + role `people`: passwords created once in
  `.secrets/people/`, userpass users created if absent (afterwards only
  `token_policies` and TTLs are kept right; nobody logs in here), the SCIM
  token (type scim, 30 days, re-minted with less than a week left, the old
  one revoked by accessor first because `max_active_tokens` is 2) and the
  console token.
- `api/lib/scim.js` (the client and `reconcile`), `scripts/roster.js`,
  `scripts/roster.sh` (`make roster`): a user the roster drops is
  deactivated, never deleted. 5 unit tests against a fake SCIM server.
- `make boundary` adds 28 rows for the five people, the console token and the
  SCIM token. A `sys/capabilities-self` that Vault refuses now **fails** its
  row: before, a refused question passed every deny row by accident (found
  here: the console and SCIM tokens had no `sys/capabilities-self`, now
  granted in their policies).
- `scripts/people-password.sh` (`make people-copy-password U=`), `tf.sh`
  without the codex variables, `clean-slate.sh` for governor's stacks and
  `.secrets/people`.

**A bootstrap policy change, and a rebuild instead of a root token.** Minting
a token from a role in a child namespace needs `sudo` ("root or sudo
privileges required to directly generate a token in a child namespace").
`vgov-ansible-platform.hcl` now grants `sudo` on exactly
`governor/auth/token/create/{scim-hr,gov-console}` (the roles still bound the
policies). The bootstrap policies cannot change after root revocation without
`make root-regen`, which is the user's call (D6). The cluster was 20 minutes
old with nothing but scratch state, so it was rebuilt from empty volumes
(`make clean-slate CONFIRM=DELETE`, then phases 1 to 8 in 74 s) instead. No
root token was regenerated.

**Checks run.** Phases 1 to 9 from empty volumes; second runs of `people`
and `make roster`: `changed=0`; `make tf-plan-all`: no changes in both
roots; `make boundary`: 64 checks pass; `node --test api/test/scim.test.js`:
5 pass; `make people-copy-password U=rowan`.

## Prompt 05: Stage, lab and gates (2026-11-11)

**Built.**

- `ansible/stage.yml` + role `stage`: the synthetic break-glass
  value at `kv/breakglass/lock-gates` (written once; Ansible reads only its
  metadata, never the data), `release-signing` created as `ecdsa-p256` with
  `deletion_allowed`, the manifest bytes in `.build/stage/manifest.json`
  (compact JSON, sorted keys: the API signs this file, never rebuilds it) and
  the v1 baseline in `.build/stage/baseline.json` (signature, v1 public key,
  manifest digest). ECDSA signatures differ every time, so the baseline is
  signed again only when Vault no longer verifies the saved one.
- `ansible/stage-reset.yml` + `scripts/stage-reset.sh` (`make stage-reset
  CONFIRM=yes`, D18): roster reconciled, key deleted and staged again at v1,
  baseline re-signed; the value stays.
- `ansible/validate.yml`: the five people log in (tokens revoked at once);
  each keyholder's login entity is in `governor-keyholders`, rowan's and
  jonas's are not; the requestor policy holds `control_group`, both EGPs are
  `hard-mandatory`, the key is `ecdsa-p256`.
- Gates: `idempotency.sh` also runs the roster (`changed=0` required);
  `secret-scan.sh` covers `.secrets/vault/tokens`, `seal`, `people`;
  `automation-digest.sh` hashes `config/story.json` and `roster.json`.
- `clean-slate` is `CONFIRM=DELETE` (the house word), not `CONFIRM=vgov` as
  prompt 05 said.

**Checks run.** `make clean-slate CONFIRM=DELETE && make lab` from nothing:
all phases and gates green in **124 s** (seal-up 2, seal-init 17, vault-seal
4, seal-tokens 5, vault-up 2, bootstrap 34, vault-platform 4, people 8,
roster 0, stage 5, validate 7; idempotency, drift, secret scan with 19 known
values, boundary 64). Second `make stage`: `changed=0`. `make stage-reset
CONFIRM=yes` then `make idempotency`: every phase and the roster
`changed=0`. `make drift` (Terraform and Ansible check mode): clean.

## Prompt 06: API (2026-11-11)

**Built.** `api/` rewritten for governor (Node 24, no dependencies):

- `server.js`: `/api/health`, `/api/story` (without the break-glass value),
  `POST /api/session` and `/api/session/logout`, `/api/me`, `/api/rule`
  (policies and EGPs read from Vault, each person's capabilities),
  `GET|POST /api/chapters/:chapter[/:step]`, `/api/ledger`, `/api/layers`.
  The console token is renewed hourly.
- `lib/session.js`: only `rowan` may sign in (userpass via the API); the
  token stays server side; cookie `gov_sid` HttpOnly, Secure,
  SameSite=Strict; idle and token expiry end the session; POST-only sign-out
  revokes; cross-site writes refused (`Sec-Fetch-Site`, `Origin`); sign-in
  rate limited (10 a minute per address).
- `lib/people.js`: the stage-hand logins (D11). **A person's token is kept
  for its TTL, never revoked after one call**: the first smoke test showed
  approvals that did not count, and probe **P27** proves why: Vault forgets
  an approval when the approver's token is revoked.
- `lib/chapters.js`: every step of the three chapters, with dependencies
  passed in. Input is checked for shape only (ticket, algorithm names); Vault
  decides. Wrapping tokens and the leaver's old token stay in the session;
  `run()` never returns Vault's raw answer (a unit test caught a wrapping
  token leaking through it). Approvers are named from logins and the roster.
- `lib/verify.js`: the lab's verifier (ECDSA P-256 PEM; ML-DSA-65 raw key
  in an SPKI header). `lib/story.js`: `publicStory()` drops the value;
  `scripts/app-build.sh` writes that public story into the image and fails if
  the value reaches the build context.
- `lib/ledger.js`: governor's story paths. **The audit log has no accessor
  for a held request** (it is a `request` entry with the error "request
  cannot be fulfilled until control group approval is obtained", no
  response), and a refused unwrap is a bare `invalid request`. Approvals and
  unwraps are therefore given to the latest held request without an
  accessor (or token) HMAC yet: a `shortcut:` comment names the limit
  (crossed approvals of two held requests would swap chapters).
  Classification runs over the whole log before `since` cuts it (a unit test
  found an unwrap losing its chapter).
- `compose/app/compose.yaml` (volume-init, api, web; no rotator, no agent),
  `scripts/app-build.sh`, `scripts/app-up.sh`.
- Tests: 36 (`session`, `verify` with real ECDSA and ML-DSA-65 keys,
  `ledger`, `chapters` with a fake Vault, `guard`, `scim`, `said`, `rate`).

**Checks run.** `NODE_ENV=test node --test 'api/test/*.test.js'`: 36 pass.
`make app-build TARGETS=api`; `APP_SERVICES="volume-init api" make app-up`:
healthy, three audit logs readable, console token present. A scripted run of
all three chapters through the live API (rowan signed in on the API):

- I: no ticket 403 (EGP); held; one approval, unwrap `Request needs further
  authorization`; jonas listed, not counted; kofi: approved; the code
  revealed once; second unwrap `wrapping token is not valid or does not
  exist`.
- II: `ecdsa-p384` 403 (EGP); `ml-dsa` 65 held; v1 after one approval; v2
  `ml-dsa` after two and the unwrap; Vault and the lab verifier: v1 ECDSA
  valid, v2 ML-DSA-65 valid.
- III: group removal: mara's old token, new login and both approvals answer
  200, none counts; kofi completes; reconcile `add mara to
  governor-keyholders`.

`make probe`: 82 pass (P27 added). `make stage-reset CONFIRM=yes` afterwards.

**Deferred to 07.** The web image and the `app-up` phase (still `# pending`):
`web/` is still codex's until the console is built.

## Prompt 07: Console UI (2026-11-11)

**Built.** `web/` rebuilt on vault_codex's shell and glass CSS: pages The
harbour, The Rule, I. The Second Key, II. The Algorithm's Key, III. The
Keyholder Who Left, Ledger, Layers; components `story.jsx` (hero, actor
chip, outcome, "Vault said", key slots) and `ui.jsx` (the sign-in form,
`TableScroll`); `useChapter` in `hooks.js`. nginx lost the `/auth/` proxy
(no Keycloak). `DESIGN.md` states what governor adds to Vault daylight glass.
`e2e/` rewritten: sign-in through the form, axe on every page (desktop,
phone, signed out), served checks (TLS 1.3, CSP, no value in a bundle or
`/api/story`, a foreign `Origin` and a cross-site write refused, verified
against the lab CA, never `ignoreHTTPSErrors`), the three chapters and the
ledger end to end, `@shots`.

**Found and fixed while testing.**

- After a release Vault forgets the request (`sys/control-group/request`
  fails), so every button went disabled and "Try to open it again" could not
  be pressed: the open button now depends on a held request in the session,
  and the slots say "released".
- An approval's "Vault said" showed the console's status lookup, not the
  approval: the step now keeps its own answer and carries the request state
  beside it.
- A kept stage-hand token did not name its person in the slots ("entity_…"):
  `people.js` keeps the entity id with the token.
- Phone layout: `.grid-2` stayed two columns (the mobile rule came before the
  base rule); tables scroll in a focusable, named region (axe
  `scrollable-region-focusable`).
- The EGP refusal quoted the whole comment header of the Sentinel policy as
  its "Description": both headers are one line now (`make vault-platform`,
  2 changed).

**Checks run.** `make test-ui`: **24 passed**, 0 axe violations;
`make screenshots`: 16 images (8 pages and states, desktop and phone),
looked at: overview, rule, second-key (desktop and phone), left,
algorithm (phone); `npx tsc --noEmit` in `e2e/`; API unit tests 36 pass;
the app phase `app-up` is no longer pending.

## Prompt 08: Rehearsal, daily operations and the Lab Index (2026-11-11)

**Built.**

- `scripts/rehearsal.sh` (`make rehearsal`, `make api-test`): **50 cases**
  through the console (https, the lab CA, rowan signed in on the form),
  starting and ending with `make stage-reset`. Negatives per beat: no
  ticket, a wrong-shape ticket (EGP), a smuggled query (the API's shape
  check), one approval, a double approval, the outsider, rowan approving
  himself (direct, his own token), a second release, `ecdsa-p384`,
  `aes256-gcm96`, `ml-dsa` 44, completing with one approval, completing
  twice, both offboarding cases (group removal: everything accepted, nothing
  counted; `active=false`: everything 403), the SCIM token outside SCIM and
  on an entity it does not own, the console token on SCIM and on the value,
  a keyholder signing in to the console, a foreign-origin write. Not
  rehearsed: a held request expiring (900 s, D10); the script says why.
- `scripts/verify.sh` (`make verify`): sections podman, vault, units (story
  check, script and API unit tests, `make lint`), platform (namespace,
  mounts, policies, EGPs, SCIM client, roster converged, `validate`), stage,
  app, console, boundary, drift, idempotency, secrets, rehearsal.
- `scripts/up.sh` (D17): installs the licence from `.env` or stops with the
  instruction; runs `make lab` on a lab that was never built; otherwise
  clock, Vault, the people's tokens (re-minted only when expired), the app.
  `make down` now says what it stopped (the Lab Index showed "make printed
  nothing.").
- `scripts/doctor.sh`, `scripts/show-ready.sh`, `scripts/license-features.sh`
  rewritten for governor (no Keycloak, rotator or codex stage); the codex
  Terraform root `terraform/probe` removed (nothing used it); the stage role
  is `stage` (ansible-lint's role-prefix rule); the API handles SIGTERM (it
  ran as PID 1 and was killed with 137 on every stop).

**Checks run.** `make rehearsal`: 50 passed in 19 s. `make verify`: **72
passed, 0 failed** (1 min 46 s). `make doctor`: nothing wrong. `make backup`:
`backups/<time>/` with both Raft snapshots and the secrets (82 MB).
`make down`: 16 s, every `vgov-` container exited, 9 volumes kept;
`make up RUNTIME=podman`: 28 s.

**The Lab Index, end to end** (the user's request; `../vault_lab_index`
unchanged, its portal `vlix-ui` was running). A refresh lists
vault_governor as **eligible**, prefix `vgov-` (source `lab`, from
`.claude/CLAUDE.md`), status `running`, 6 containers. Through the
dashboard's own buttons (Playwright): **Stop** (with its confirmation) ran
`make -C vault_governor down RUNTIME=podman`, `stopped` after **8 s**;
**Start** ran `make up RUNTIME=podman`, `running` after **29 s**, operation
`succeeded`, exit 0. Afterwards: 9 `vgov-` volumes still there and
`make verify` 72 passed. Screenshots: `docs/screenshots/lab-index-running.png`,
`-stopped.png`, `-started.png`. No other lab was started or stopped (every
other lab was already stopped).

## Prompt 09: Docs, public readiness and the final run (2026-11-11)

**Built.** `README.md` (its first paragraph is what the Lab Index shows:
after a refresh the card reads "vault_governor: The Second Key" with the
description and the four local links), `docs/architecture.md`,
`docs/operations.md`, `docs/security-model.md` (boundaries with the check
that proves each, the stage-hand shortcut, the ledger's chapter guess, what
is synthetic), `docs/ownership.md`, `CHANGELOG.md`, `CONTRIBUTING.md`; CI
(`.github/workflows/ci.yml`) runs `story-check` instead of codex's check.
`docs/capabilities.md` is generated with a markdownlint exception at its
top: it quotes Vault verbatim.

**Leftovers removed.** Codex's CSS for the path, seals, digits, letters and
ash (`story.css` from 215 to about 130 lines), the 650 ms unfold and the
500 ms keyhole fill (now 180 ms, as `DESIGN.md` says), codex names in
`package.json` descriptions, `said.test.js` fixtures and the stats callback.

**Public readiness.** No em dash in any publishable file; no private path;
`markdownlint-cli2` on README, CONTRIBUTING, CHANGELOG, DESIGN and
`docs/*.md`: 0 issues; `gitleaks dir`: every finding is in an ignored file
(`.secrets/`, `vault-tls/vault.key`), none in a file git would publish;
`git status --untracked-files=all` shows none of the private set;
`git check-ignore` on real sources: none ignored.

**Final validation.**

- From a stopped stack: `make down` and `make up RUNTIME=podman` in 34 s;
  `make verify` **72 passed** (109 s); `make test-ui` **24 passed**.
- From nothing: `make clean-slate CONFIRM=DELETE && make lab`: converged in
  **118 s** with every gate green; `make verify` **72 passed** (100 s).
- Unit tests: 46 (`make test-unit`). `make probe`: 82 passed.

## Prompt 99: clean loop

### Round 1 (2026-11-11), after commit 2ca7eb5

Reviews: `/ponytail:ponytail-audit` (1 to 8), `/ponytail:ponytail-review`
(9, 10), `/backend-design:audit` (11 to 14),
`/backend-design:security-discipline` (15 to 17). Seventeen findings, all
fixed:

1. The presenter was signed out after an hour (rowan's token lived 1h):
   every person's `token_ttl` now follows `VGOV_SESSION_IDLE` (4h), max 8h;
   measured: cookie `Max-Age=14400`.
2. `make probe` restored the root Control Group TTL as a hard-coded 15m: it
   now puts back the value it read (case P10 "put back as found"); after a
   probe both plans are empty. Probe: 83 cases.
3. The stage-hand token cache had no test: `api/test/people.test.js` (3).
4. The README's "about 3 GB" was a guess: measured 1.2 GB, with the parts.
5. Dead code: `people.forgetAll`, `hooks.useAction`.
6. The Vault UI link ignored port overrides: `/api/health` returns
   `vaultUi` from `VAULT_UI_URL`.
7. The sign-in limit is one bucket for the console (every sign-in arrives
   from nginx): code comment and `docs/security-model.md` say so.
8. `app-build`'s value check: `grep -rqF`.
9. Playing a chapter again kept the last request's release count (a false
   "opens once" wink): `hold()` replaces the chapter state; a test fails on
   the old code and passes now.
10. Tokens were on curl command lines in six scripts: `vcurl` in
    `scripts/common.sh` sends the header from a curl config on a file
    descriptor; `ps` shows `curl -K /dev/fd/63 ...` only.
11. A SCIM refusal became "internal error" (`ScimError` had no `name`): the
    API tests `instanceof`, logs the reason and returns Vault's answer (502).
12. A missing SCIM token was a 500 and health said ok: the reader throws a
    503 with "run make people"; `/api/health` reports `scim_token`.
13. A SCIM call could hang forever (`AbortSignal.timeout`): the same
    referenced `setTimeout` as `vault.js`; a test with a hanging fetch.
14. SCIM always went to vault-1: it follows the active node.
15. The console token could read every entity: three unused paths removed;
    two new deny rows (`make boundary`: 66).
16. Backups copied `.secrets/legacy` and the provider cache (82 MB): both
    excluded (1.1 MB).
17. No HSTS, and no reason given: the reason is in the nginx template and
    `docs/security-model.md` (HSTS on localhost would force https on every
    other lab's port).

Results: unit tests 52 (scripts 7, API 42, web 3); `make lint` clean;
`make boundary` 66; `make probe` 83; `make verify` **72 passed**;
`make test-ui` **24 passed**; `make tf-plan-all` empty.

### Round 2 (2026-11-11), after commit 44f5f7e

The four reviews again (the whole repo, the round 1 commit, the API and the
SCIM CLI, the security pass). Four findings, all fixed:

18. `make down` said "stopped" even when nothing stopped (each compose stop
    swallowed its error): `scripts/down.sh` fails when Podman does not
    answer or a `vgov-` container still runs, and only then says stopped.
    A real `make down`: 8 s, exit 0.
19. The Overview's chapter list broke titles word by word (`.next-list li`
    laid title and text side by side): title above text now.
20. Dependabot watched Terraform in `/`, where none is left: it now watches
    GitHub Actions, both Terraform roots and npm in `web/` and `e2e/`.
21. A policy name broke at its dash in the people table: identifiers stay
    whole (`.nowrap`).

Results: `make verify` **72 passed**, `make test-ui` **24 passed**,
screenshots refreshed and looked at (overview, desktop and phone).

### Round 3 (2026-11-11 and 12), after commit 8ab443b

The four reviews again. One finding, fixed:

22. `ansible/probe.yml` was codex's Ansible probe (case P25, marker
    "lantern"); governor's `make probe` never runs it and nothing refers to
    it. Deleted.

The first `make verify` of this round failed one check: the Podman VM clock
was 899 s behind the Mac after the Mac slept (`make clock-sync` found 4858 s
by the time it ran). Not a lab defect: the check did its job.
`make clock-sync`, then `make verify`: **72 passed** (16 341 s wall time,
the Mac slept through most of it). `make lint`: clean.

### Round 4 (2026-11-12), after commit 97b5ba7

The four reviews again, plus a mechanical sweep (every `make` target has its
script; every key in `config/defaults.conf` is read somewhere). One finding,
fixed:

23. `VGOV_WEB_CN` in `config/defaults.conf` was read by nothing
    (`gen-certs.sh` puts `governor.localhost` in the SANs itself), so an
    override in `.env` would have changed nothing: the key is gone.

Results (the Mac slept and its lid was closed during the first runs; each
run started with `make clock-sync`, which found the VM 533 s and then 11 s
behind): `make test-ui` **24 passed** (98 s, awake), `make doctor` nothing
wrong, `make verify` **72 passed** (5229 s wall time, lid closed).

### Round 5 (2026-11-12), after commit bc31e09: zero to-dos

The four reviews found nothing new. Also read for the first time: the two
copied workflows (`release.yml` runs only on a `v*` tag; `gitleaks.yml` is
SHA-pinned with read-only permissions): both fine.

GitHub Actions on `main`: CI and Gitleaks green on `2ca7eb5`, `97b5ba7` and
`bc31e09` (unit tests and console build; shell, Terraform, Ansible, Node).
The runs of `44f5f7e` and `8ab443b` stayed queued on GitHub's side; their
code is all in `97b5ba7`, which is green.

**Open for the user, not to-dos:** Dependabot (fixed in round 2) opened pull
requests for lucide-react, tailwindcss, @tailwindcss/vite,
gitleaks-action 3, actions/checkout 7 and @playwright/test 1.65, all green
in CI. Merging is the user's call. Note on Playwright 1.65: the lab runs the
cached Chromium of 1.64.1 (the lock file); 1.65 needs a new browser
download (`npx playwright install chromium`) before `make test-ui`.

The loop ends here: `make verify` 72, `make test-ui` 24, `make boundary` 66,
`make probe` 83, `make rehearsal` 50, 52 unit tests.

## Done (2026-11-12)

The user's own run before handing over: `make clock-sync` (the VM was 5061 s
behind after the Mac slept) and `make show-ready`: green in 126 s, console at
<https://localhost:13901/#/overview>.
