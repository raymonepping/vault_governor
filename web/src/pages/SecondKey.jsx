// pages/SecondKey.jsx: chapter I (input/05.md). Rowan's break-glass read:
// refused without a ticket (EGP), held with one (Control Group), released
// after two eligible approvals, once. The motion: the two keyholes fill when
// Vault says approved.
import { useState } from 'react';
import { KeyRound, LockOpen, UserCheck, Ticket } from 'lucide-react';
import { useChapter } from '../hooks.js';
import { useAuth, SignInNotice, ErrorNotice, Mono } from '../components/ui.jsx';
import { Hero, Outcome, KeySlots, wink } from '../components/story.jsx';

const APPROVERS = [
  ['ines', 'Ines, harbour master'],
  ['kofi', 'Kofi, lock operations'],
  ['mara', 'Mara, control systems'],
  ['jonas', 'Jonas, contractor'],
];

export default function SecondKey() {
  const me = useAuth();
  const c = useChapter('second-key', me.signedIn);
  const [ticket, setTicket] = useState('HAR-0417');
  const req = c.view.data?.request;
  const opened = c.results.open?.vault?.status === 200 ? c.results.open.vault.data?.data : null;
  const busy = Boolean(c.busy);
  return (
    <>
      <Hero number="Chapter I" title="The Second Key" lede="Night shift. The west basin lock gates are stuck, and Rowan needs the recovery code. Vault will not hand it to one person.">
        {opened ? (
          <figure className="riddle">
            <figcaption className="riddle__label">Vault released the recovery code (synthetic)</figcaption>
            <blockquote className="riddle__text">
              <Mono>{opened.recovery_code}</Mono>
            </blockquote>
            <p className="gov-hero__hint">{opened.system}. {opened.note}</p>
          </figure>
        ) : (
          <p className="gov-hero__hint">Path <Mono>kv/data/breakglass/lock-gates</Mono>: an EGP wants a ticket, the Control Group wants two keyholders.</p>
        )}
      </Hero>
      {!me.signedIn && <SignInNotice />}
      <div className="grid-2">
        <section className="vg-card stack" aria-labelledby="ask-h">
          <div className="card-head">
            <h3 id="ask-h">1. Rowan asks</h3>
            <span className="card-sub">with Rowan's own token</span>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy || !me.signedIn} onClick={() => c.run('read', {}, 'I: read without a ticket', 'noticket')}>
              <KeyRound size={14} aria-hidden="true" /> Ask without a ticket
            </button>
          </div>
          <Outcome r={c.results.noticket} wink={c.results.noticket?.vault?.status === 403 ? wink.ticket : null} />
          <form
            className="answer-form"
            onSubmit={(e) => {
              e.preventDefault();
              c.run('read', { ticket }, `I: read with ticket ${ticket}`);
            }}
          >
            <label className="form-field answer-form__field" htmlFor="ticket">
              <span>Incident ticket</span>
              <input id="ticket" autoComplete="off" spellCheck={false} maxLength={32} value={ticket} onChange={(e) => setTicket(e.target.value)} />
            </label>
            <button type="submit" className="primary-button" disabled={busy || !me.signedIn || !ticket}>
              <Ticket size={14} aria-hidden="true" /> Ask with the ticket
            </button>
          </form>
          <Outcome r={c.results.read} heldText="held: Vault waits for two keyholders" />
        </section>
        <section className="vg-card stack" aria-labelledby="keys-h">
          <div className="card-head">
            <h3 id="keys-h">2. The keyholders</h3>
            <span className="card-sub">each with their own login (stage hand)</span>
          </div>
          <KeySlots request={req} view={c.view.data} />
          <div className="actions">
            {APPROVERS.map(([u, label]) => (
              <button key={u} type="button" className="secondary-button" disabled={busy || !req} onClick={() => c.run('approve', { as: u }, `I: ${u} approves`, `approve-${u}`)}>
                <UserCheck size={14} aria-hidden="true" /> Approve as {label}
              </button>
            ))}
          </div>
          {req && !req.approved && req.by?.some((b) => !b.member) && <p className="wink">{wink.outsider}</p>}
          {req && !req.approved && req.by?.filter((b) => b.member).length === 1 && <p className="wink">{wink.one}</p>}
          {APPROVERS.map(([u]) => (
            <Outcome key={u} r={c.results[`approve-${u}`]} okText="approval recorded" />
          ))}
        </section>
      </div>
      <section className="vg-card stack" aria-labelledby="open-h">
        <div className="card-head">
          <h3 id="open-h">3. Rowan opens it</h3>
          <span className="card-sub">
            <Mono>sys/wrapping/unwrap</Mono> of the held request
          </span>
        </div>
        <div className="actions">
          <button type="button" className="primary-button" disabled={busy || !c.view.data?.held} onClick={() => c.run('open', {}, 'I: Rowan opens the held read')}>
            <LockOpen size={14} aria-hidden="true" /> {c.view.data?.opened ? 'Try to open it again' : 'Open it'}
          </button>
        </div>
        <Outcome r={c.results.open} okText="released" wink={c.view.data?.opened && c.results.open?.vault?.status === 400 ? wink.once : null} />
        <ErrorNotice error={c.error} title="Chapter I" />
      </section>
      {c.view.data?.opened > 0 && (
        <a className="secondary-button next-act" href="#/algorithm">
          On to chapter II
        </a>
      )}
    </>
  );
}
