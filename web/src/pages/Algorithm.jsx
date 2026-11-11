// pages/Algorithm.jsx: chapter II (input/06.md). The release-signing key
// changes from ECDSA P-256 to ML-DSA-65 behind the same two keyholders; the
// EGP allows only that target. Both signatures are then checked by Vault and
// by the lab's own verifier. The motion: version 2 appears in the key.
import { FileSignature, Ban, UserCheck, CheckCheck, PenLine, ShieldCheck } from 'lucide-react';
import { useChapter } from '../hooks.js';
import { useAuth, SignInNotice, ErrorNotice, Mono, StatePill, TableScroll } from '../components/ui.jsx';
import { Hero, Outcome, KeySlots, Said, wink } from '../components/story.jsx';

function KeyVersions({ k }) {
  if (!k) return <p className="dim">Reading the key…</p>;
  return (
    <ol className="versions" aria-label="Key versions">
      {k.versions.map((v) => (
        <li key={v.version} className="version vg-tile">
          <span className="version__n">v{v.version}</span>
          <span className="version__state">{v.name ? <Mono>{v.name}</Mono> : 'no name'}</span>
          {v.version === k.latest_version && <StatePill state="info">latest</StatePill>}
        </li>
      ))}
    </ol>
  );
}

export default function Algorithm() {
  const me = useAuth();
  const c = useChapter('algorithm', me.signedIn);
  const k = c.view.data?.key || c.results.key?.key;
  const req = c.view.data?.request;
  const busy = Boolean(c.busy);
  const ver = c.results.verify?.results;
  return (
    <>
      <Hero number="Chapter II" title="The Algorithm's Second Key" lede="The key that signs every lock-gate release is changing its nature, from ECDSA P-256 to the post-quantum ML-DSA-65. So the keyholders must approve the change.">
        <p className="gov-hero__hint">
          Same key name, <Mono>release-signing</Mono>. Now at v{k?.latest_version ?? '?'} ({k?.latest_version_type || '…'}).
        </p>
      </Hero>
      {!me.signedIn && <SignInNotice />}
      <div className="grid-2">
        <section className="vg-card stack" aria-labelledby="key-h">
          <div className="card-head">
            <h3 id="key-h">The key and the baseline</h3>
            <span className="card-sub">read with the console's own token</span>
          </div>
          <KeyVersions k={k} />
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => c.run('baseline', {}, 'II: verify the v1 baseline')}>
              <ShieldCheck size={14} aria-hidden="true" /> Verify the v1 baseline
            </button>
          </div>
          {c.results.baseline && (
            <p className="m-0">
              Manifest <Mono>{c.results.baseline.manifest?.name} {c.results.baseline.manifest?.version}</Mono>, signed with v{c.results.baseline.baseline?.version}: <StatePill state={c.results.baseline.vault?.data?.valid ? 'ok' : 'denied'}>{c.results.baseline.vault?.data?.valid ? 'valid' : 'not valid'}</StatePill>
            </p>
          )}
          <Said v={c.results.baseline?.vault} />
        </section>
        <section className="vg-card stack" aria-labelledby="req-h">
          <div className="card-head">
            <h3 id="req-h">Rowan proposes the change</h3>
            <span className="card-sub">
              <Mono>POST transit/keys/release-signing/algorithm</Mono>
            </span>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => c.run('request', { type: 'ecdsa-p384' }, 'II: ask for ecdsa-p384', 'forbidden')}>
              <Ban size={14} aria-hidden="true" /> Ask for ECDSA P-384
            </button>
            <button type="button" className="primary-button" disabled={busy || !me.signedIn} onClick={() => c.run('request', { type: 'ml-dsa', parameter_set: '65' }, 'II: ask for ml-dsa 65')}>
              <FileSignature size={14} aria-hidden="true" /> Ask for ML-DSA-65
            </button>
          </div>
          <Outcome r={c.results.forbidden} wink={c.results.forbidden?.vault?.status === 403 ? wink.target : null} />
          <Outcome r={c.results.request} heldText="held: the key stays at its version" />
        </section>
      </div>
      <section className="vg-card stack" aria-labelledby="ap-h">
        <div className="card-head">
          <h3 id="ap-h">Two keyholders, then the change</h3>
        </div>
        <KeySlots request={req} view={c.view.data} />
        <div className="actions">
          {['ines', 'kofi', 'mara'].map((u) => (
            <button key={u} type="button" className="secondary-button" disabled={busy || !req} onClick={() => c.run('approve', { as: u }, `II: ${u} approves`, `approve-${u}`)}>
              <UserCheck size={14} aria-hidden="true" /> Approve as {u}
            </button>
          ))}
          <button type="button" className="primary-button" disabled={busy || !c.view.data?.held} onClick={() => c.run('open', {}, 'II: Rowan completes the change')}>
            <CheckCheck size={14} aria-hidden="true" /> Complete the change
          </button>
        </div>
        {['ines', 'kofi', 'mara'].map((u) => (
          <Outcome key={u} r={c.results[`approve-${u}`]} okText="approval recorded" />
        ))}
        <Outcome r={c.results.open} okText="Vault changed the key" />
      </section>
      <section className="vg-card stack" aria-labelledby="ver-h">
        <div className="card-head">
          <h3 id="ver-h">Both sides of the migration</h3>
          <span className="card-sub">Vault's verify, and the lab's own verifier with only the public key (node:crypto)</span>
        </div>
        <div className="actions">
          <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => c.run('sign', {}, 'II: sign the manifest again')}>
            <PenLine size={14} aria-hidden="true" /> Sign the manifest again
          </button>
          <button type="button" className="primary-button" disabled={busy || !me.signedIn} onClick={() => c.run('verify', {}, 'II: verify every signature')}>
            <ShieldCheck size={14} aria-hidden="true" /> Verify every signature
          </button>
        </div>
        <Outcome r={c.results.sign} okText={`signed with v${c.results.sign?.version ?? '?'}`} />
        {ver && (
          <TableScroll label="Signature checks">
            <table className="vg-table">
              <thead>
                <tr>
                  <th scope="col">Signature</th>
                  <th scope="col">Vault verify</th>
                  <th scope="col">Lab verifier</th>
                </tr>
              </thead>
              <tbody>
                {ver.map((v) => (
                  <tr key={v.version}>
                    <th scope="row">v{v.version}</th>
                    <td>
                      <StatePill state={v.vault_valid ? 'ok' : 'denied'}>{v.vault_valid ? 'valid' : 'not valid'}</StatePill>
                    </td>
                    <td>
                      {v.lab.error ? (
                        <StatePill state="denied">cannot verify: {v.lab.error}</StatePill>
                      ) : (
                        <StatePill state={v.lab.valid ? 'ok' : 'denied'}>
                          {v.lab.keyType}: {v.lab.valid ? 'valid' : 'not valid'}
                        </StatePill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        <p className="explain m-0">The key name stayed the same; the signatures did not. A consumer that pins ECDSA would refuse v2. This verifier is Node 24: it reads both.</p>
        <ErrorNotice error={c.error} title="Chapter II" />
      </section>
    </>
  );
}
