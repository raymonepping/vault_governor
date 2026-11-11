// pages/Ledger.jsx: the Epilogue. The audit logs of all three nodes, merged:
// every request, refusal, approval, release, key change and roster change,
// with who did it. Values stay HMAC'd: the ledger knows who asked, not what
// they got. The motion: the timeline draws itself.
import { useMemo, useState } from 'react';
import { useResource } from '../hooks.js';
import { useAuth, ErrorNotice, SignInNotice, Loading, StatePill } from '../components/ui.jsx';
import { Hero, wink } from '../components/story.jsx';

const CHAPTER = { 'second-key': 'I', algorithm: 'II', left: 'III' };

export default function Ledger() {
  const me = useAuth();
  const l = useResource('ledger', '/api/ledger', { intervalMs: me.signedIn ? 5000 : 0 });
  const [who, setWho] = useState('');
  const [chapter, setChapter] = useState('');
  const all = l.data?.events || [];
  const events = useMemo(() => all.filter((e) => (!who || e.who === who) && (!chapter || e.chapter === chapter)), [all, who, chapter]);
  const people = [...new Set(all.map((e) => e.who))].sort();
  return (
    <>
      <Hero number="Epilogue" title="The Ledger" lede="The night, replayed from the audit logs of all three nodes: who asked, which rule refused, who approved, when Vault released it, when HR changed the roster.">
        <p className="gov-hero__hint">{wink.ledger}</p>
      </Hero>
      {!me.signedIn && <SignInNotice />}
      <section className="vg-card stack" aria-labelledby="tl-h">
        <div className="card-head">
          <h3 id="tl-h">Timeline</h3>
          <span className="card-sub">{l.data ? `${events.length} of ${all.length} events` : ''}</span>
        </div>
        <div className="filters">
          <label className="form-field form-field--inline" htmlFor="f-who">
            <span>Person</span>
            <select id="f-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field--inline" htmlFor="f-ch">
            <span>Chapter</span>
            <select id="f-ch" value={chapter} onChange={(e) => setChapter(e.target.value)}>
              <option value="">every chapter</option>
              {Object.entries(CHAPTER).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {l.error && me.signedIn && <ErrorNotice error={l.error} title="The ledger" />}
        {!l.data && !l.error && me.signedIn && <Loading label="Reading three audit logs…" />}
        {l.data && events.length === 0 && <p className="dim">Nothing yet: play a chapter.</p>}
        <ol className="ledger">
          {events.map((e, i) => (
            <li key={`${e.request_id}-${e.node}-${i}`} className={`ledger__event${e.ok ? '' : ' ledger__event--refused'}`}>
              <time className="ledger__time" dateTime={e.time}>
                {new Date(e.time).toLocaleTimeString('en-GB')}
              </time>
              <span className="ledger__node">{e.node}</span>
              <span className="ledger__act">{CHAPTER[e.chapter] || '–'}</span>
              <span className="ledger__who">{e.who}</span>
              <span className="ledger__kind">
                {e.kind}
                {e.error && <span className="dim"> · {e.error}</span>}
              </span>
              {e.ok ? <StatePill state="ok">ok</StatePill> : <StatePill state="denied">refused</StatePill>}
            </li>
          ))}
        </ol>
        <p className="explain m-0">The log names no accessor for a held request: each approval is placed with the latest held request that had none yet, which is right while one request is played at a time.</p>
      </section>
    </>
  );
}
