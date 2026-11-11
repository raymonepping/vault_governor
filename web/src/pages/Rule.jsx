// pages/Rule.jsx: the prologue. The rules as Vault holds them (read with the
// console's own token), and what each person may do on the protected paths
// (sys/capabilities-self with each person's own login).
import { useResource } from '../hooks.js';
import { useAuth, SignInNotice, ErrorNotice, Loading, Mono, StatePill, TableScroll } from '../components/ui.jsx';
import { Hero } from '../components/story.jsx';

const LABEL = {
  'kv/data/breakglass/lock-gates': 'read the recovery code',
  'transit/keys/release-signing/algorithm': 'change the key algorithm',
  'sys/control-group/authorize': 'approve',
};

function Source({ p }) {
  return (
    <section className="vg-card stack" aria-labelledby={`src-${p.name}`}>
      <div className="card-head">
        <h3 id={`src-${p.name}`}>
          <Mono>{p.name}</Mono>
        </h3>
        <span className="card-sub">
          {p.enforcement_level ? (
            <>
              EGP on <Mono>{(p.paths || []).join(', ')}</Mono>, <StatePill state="denied">{p.enforcement_level}</StatePill>
            </>
          ) : (
            'ACL policy'
          )}
        </span>
      </div>
      <pre className="policy-src" tabIndex={0} aria-label={`${p.name} source`}>
        {p.policy || (p.vault?.errors || []).join('\n')}
      </pre>
    </section>
  );
}

export default function Rule() {
  const me = useAuth();
  const r = useResource('rule', '/api/rule');
  const d = r.data;
  return (
    <>
      <Hero number="Prologue" title="The Rule" lede="Before anything runs, read the rule. Terraform installed it from code; Vault returns it here exactly as it enforces it.">
        <p className="gov-hero__hint">Two approvals from governor-keyholders. A ticket on every break-glass read. ML-DSA-65 or nothing for the signing key.</p>
      </Hero>
      {!me.signedIn && <SignInNotice />}
      {me.signedIn && r.error && <ErrorNotice error={r.error} title="The rule" />}
      {me.signedIn && !d && !r.error && <Loading />}
      {d && (
        <>
          <section className="vg-card stack" aria-labelledby="caps-h">
            <div className="card-head">
              <h3 id="caps-h">Who may do what</h3>
              <span className="card-sub">
                <Mono>sys/capabilities-self</Mono>, asked with each person's own token
              </span>
            </div>
            <TableScroll label="Who may do what">
              <table className="vg-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {d.capabilities.paths.map((p) => (
                      <th key={p} scope="col">
                        {LABEL[p] || p}
                        <br />
                        <Mono>{p}</Mono>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.capabilities.rows.map((row) => (
                    <tr key={row.user}>
                      <th scope="row">
                        {row.user} <span className="dim">{row.role}</span>
                      </th>
                      {d.capabilities.paths.map((p) => {
                        const caps = row.caps?.[p] || [];
                        const denied = !caps.length || caps.includes('deny');
                        return (
                          <td key={p}>
                            {row.caps ? <StatePill state={denied ? 'denied' : 'ok'}>{caps.join(', ') || 'deny'}</StatePill> : <span className="dim">{row.error || 'not asked'}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <p className="explain m-0">
              A capability is not the whole answer: Rowan's read and algorithm change also carry a Control Group factor and an EGP, below. Nothing here is global; every policy lives in namespace <Mono>governor</Mono>.
            </p>
          </section>
          <div className="grid-2">
            {d.acl.map((p) => (
              <Source key={p.name} p={p} />
            ))}
          </div>
          <div className="grid-2">
            {d.egp.map((p) => (
              <Source key={p.name} p={p} />
            ))}
          </div>
          <section className="vg-card stack" aria-labelledby="vault-own-h">
            <div className="card-head">
              <h3 id="vault-own-h">Vault's own rule, under the EGP</h3>
            </div>
            <p className="m-0">
              Without the EGP, Vault itself refuses a signing key that becomes an encryption key: <code className="mono">incompatible algorithm aes256-gcm96 for key type ecdsa-p256</code> (probe P13, <Mono>docs/capabilities.md</Mono>). The EGP narrows that further, to one approved target.
            </p>
          </section>
        </>
      )}
    </>
  );
}
