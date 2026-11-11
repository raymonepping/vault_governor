// pages/Left.jsx: chapter III (input/07.md). A request waits with one
// approval; HR (the SCIM client) offboards Mara; the lab shows what Vault
// still lets her do, then Kofi completes the request and HR's roster is
// reconciled. Every answer is measured, none is scripted.
import { useState } from 'react';
import { Users, KeyRound, UserCheck, LogIn, UserMinus, Search, LockOpen, RefreshCw } from 'lucide-react';
import { useChapter } from '../hooks.js';
import { useAuth, SignInNotice, ErrorNotice, Mono, StatePill, TableScroll } from '../components/ui.jsx';
import { Hero, Outcome, KeySlots, Said, Actor, wink } from '../components/story.jsx';

export default function Left() {
  const me = useAuth();
  const c = useChapter('left', me.signedIn);
  const [mode, setMode] = useState('group');
  const req = c.view.data?.request;
  const busy = Boolean(c.busy);
  const roster = c.results.roster?.roster;
  const checks = c.results['leaver-check']?.checks;
  const step = (name, label, body, key) => c.run(name, body, `III: ${label}`, key);
  return (
    <>
      <Hero number="Chapter III" title="The Keyholder Who Left" lede="A request waits with one approval. Then Mara, head of control systems, leaves the harbour. HR updates the roster through SCIM. Can she still turn the second key?">
        <p className="gov-hero__hint">{wink.left}</p>
      </Hero>
      {!me.signedIn && <SignInNotice />}
      <div className="grid-2">
        <section className="vg-card stack" aria-labelledby="roster-h">
          <div className="card-head">
            <h3 id="roster-h">The roster</h3>
            <span className="card-sub">SCIM client <Mono>governor-hr</Mono> owns the users and the group</span>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => step('roster', 'read the roster')}>
              <Users size={14} aria-hidden="true" /> Read the roster
            </button>
          </div>
          {roster && (
            <TableScroll label="The roster">
              <table className="vg-table">
                <thead>
                  <tr>
                    <th scope="col">Keyholder</th>
                    <th scope="col">Account</th>
                    <th scope="col">governor-keyholders</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((u) => (
                    <tr key={u.id}>
                      <th scope="row">{u.user}</th>
                      <td>
                        <StatePill state={u.active ? 'ok' : 'denied'}>{u.active ? 'active' : 'deactivated'}</StatePill>
                      </td>
                      <td>
                        <StatePill state={u.member ? 'ok' : 'denied'}>{u.member ? 'member' : 'not a member'}</StatePill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          <Said v={c.results.roster?.vault} />
        </section>
        <section className="vg-card stack" aria-labelledby="wait-h">
          <div className="card-head">
            <h3 id="wait-h">1. A request waits</h3>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => step('request', 'Rowan asks')}>
              <KeyRound size={14} aria-hidden="true" /> Rowan asks
            </button>
            <button type="button" className="secondary-button" disabled={busy || !req} onClick={() => step('approve', 'ines approves', { as: 'ines' }, 'approve-ines')}>
              <UserCheck size={14} aria-hidden="true" /> Ines approves
            </button>
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => step('leaver-login', 'Mara signs in, still on duty')}>
              <LogIn size={14} aria-hidden="true" /> Mara signs in (her token from before)
            </button>
          </div>
          <KeySlots request={req} view={c.view.data} />
          <Outcome r={c.results.request} heldText="held" />
          <Outcome r={c.results['approve-ines']} okText="approval recorded" />
          <Outcome r={c.results['leaver-login']} okText="Mara holds a token" />
        </section>
      </div>
      <section className="vg-card stack" aria-labelledby="leave-h">
        <div className="card-head">
          <h3 id="leave-h">2. Mara leaves</h3>
          <span className="card-sub">HR acts through SCIM; Terraform's rule does not change</span>
        </div>
        <div className="actions">
          <label className="form-field form-field--inline" htmlFor="leave-mode">
            <span>How HR offboards her</span>
            <select id="leave-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="group">remove her from governor-keyholders</option>
              <option value="inactive">deactivate her account (active=false)</option>
            </select>
          </label>
          <button type="button" className="primary-button" disabled={busy || !me.signedIn} onClick={() => step('offboard', `HR offboards Mara (${mode})`, { mode })}>
            <UserMinus size={14} aria-hidden="true" /> Offboard Mara
          </button>
          <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => step('leaver-check', 'what can Mara still do?')}>
            <Search size={14} aria-hidden="true" /> What can she still do?
          </button>
        </div>
        {c.results.offboard?.leaver && (
          <p className="m-0" role="status">
            <Actor who="HR (SCIM)" /> Mara now: account <StatePill state={c.results.offboard.leaver.active ? 'ok' : 'denied'}>{c.results.offboard.leaver.active ? 'active' : 'deactivated'}</StatePill>, group <StatePill state={c.results.offboard.leaver.member ? 'ok' : 'denied'}>{c.results.offboard.leaver.member ? 'member' : 'not a member'}</StatePill>
          </p>
        )}
        {checks && (
          <TableScroll label="What Mara can still do">
            <table className="vg-table">
              <thead>
                <tr>
                  <th scope="col">Mara tries</th>
                  <th scope="col">Vault's answer</th>
                  <th scope="col">Does it count?</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((x) => (
                  <tr key={x.check}>
                    <th scope="row">{x.check}</th>
                    <td>
                      <StatePill state={x.works ? 'warn' : 'denied'}>{x.works ? `HTTP ${x.vault.status}: accepted` : `HTTP ${x.vault.status}: ${(x.vault.errors[0] || 'refused').replace(/^\d+ errors? occurred:\s*\*?\s*/, '')}`}</StatePill>
                    </td>
                    <td>{x.request ? <StatePill state={x.request.approved ? 'ok' : 'denied'}>{x.request.approved ? 'the request is approved' : 'Vault does not count it'}</StatePill> : <span className="dim">not an approval</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        <ErrorNotice error={c.error} title="Chapter III" />
      </section>
      <section className="vg-card stack" aria-labelledby="done-h">
        <div className="card-head">
          <h3 id="done-h">3. The council that remains</h3>
        </div>
        <div className="actions">
          <button type="button" className="secondary-button" disabled={busy || !req} onClick={() => step('approve', 'kofi approves', { as: 'kofi' }, 'approve-kofi')}>
            <UserCheck size={14} aria-hidden="true" /> Kofi approves
          </button>
          <button type="button" className="primary-button" disabled={busy || !c.view.data?.held} onClick={() => step('open', 'Rowan opens it')}>
            <LockOpen size={14} aria-hidden="true" /> Rowan opens it
          </button>
          <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => step('reconcile', 'HR reconciles the roster')}>
            <RefreshCw size={14} aria-hidden="true" /> HR reconciles the roster
          </button>
        </div>
        <Outcome r={c.results['approve-kofi']} okText="approval recorded" />
        <Outcome r={c.results.open} okText="released" />
        {c.results.reconcile && (
          <p className="m-0" role="status">
            <Actor who="HR (SCIM)" /> changed={c.results.reconcile.changed}
            {c.results.reconcile.changes?.length ? `: ${c.results.reconcile.changes.join('; ')}` : ': the roster was already converged'}
          </p>
        )}
      </section>
    </>
  );
}
