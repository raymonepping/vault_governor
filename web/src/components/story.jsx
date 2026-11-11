// components/story.jsx: the pieces every chapter shares. Vault's answer
// first, the wink second (DESIGN.md).
import { ScrollText, UserRound } from 'lucide-react';
import { tidy, StatePill } from './ui.jsx';

// The hero: the page's one ink pane.
export function Hero({ number, title, lede, children, id = 'hero-h' }) {
  return (
    <section className="vg-hero gov-hero" aria-labelledby={id}>
      {number && <p className="gov-hero__number">{number}</p>}
      <h2 id={id} className="hero-title gov-hero__title">
        {title}
      </h2>
      {lede && <p className="hero-lede">{lede}</p>}
      {children}
    </section>
  );
}

// Whose token made the call (D11): the presenter, a stage hand, HR or the console.
export function Actor({ who }) {
  if (!who) return null;
  return (
    <span className="actor" title="whose Vault token made this call">
      <UserRound size={12} aria-hidden="true" />
      {who}
    </span>
  );
}

// "Vault said" for one call: method, path, who, status, errors verbatim.
export function Said({ v, title = 'Vault said', open = false }) {
  if (!v) return null;
  const ok = v.status >= 200 && v.status < 300;
  return (
    <details className="said" open={open}>
      <summary>
        <ScrollText size={14} aria-hidden="true" />
        <span>{title}</span>
        <span className={`said-status ${ok ? 'ok' : 'bad'}`}>HTTP {v.status}</span>
        <span className="said__as">as {v.as}</span>
      </summary>
      <dl className="facts said__facts">
        <dt>Call</dt>
        <dd>
          <code className="mono">
            {v.method} {v.path}
          </code>
        </dd>
        <dt>Node</dt>
        <dd>{v.node || '–'}</dd>
        {v.errors?.length > 0 && (
          <>
            <dt>Errors</dt>
            <dd>
              <ul className="vault-errors">
                {v.errors.map((e) => (
                  <li key={e}>
                    <code>{tidy(e)}</code>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {v.wrap_info && (
          <>
            <dt>Held</dt>
            <dd>
              accessor <code className="mono">{v.wrap_info.accessor}</code>, waits up to {v.wrap_info.ttl}s
            </dd>
          </>
        )}
        <dt>Request</dt>
        <dd>
          <code className="mono">{v.request_id || '–'}</code>
        </dd>
      </dl>
    </details>
  );
}

// One step's outcome: a pill with Vault's status, the actor, Vault's errors.
export function Outcome({ r, okText = 'allowed', heldText = 'held by Vault', wink }) {
  if (!r?.vault) return null;
  const v = r.vault;
  const held = Boolean(v.wrap_info);
  const ok = v.status >= 200 && v.status < 300;
  return (
    <div className={`outcome${ok ? '' : ' outcome--refused'}`} role="status">
      <div className="outcome__head">
        <StatePill state={held ? 'warn' : ok ? 'ok' : 'denied'}>{held ? heldText : ok ? okText : `refused, HTTP ${v.status}`}</StatePill>
        <Actor who={r.actor || v.as} />
      </div>
      {!ok && (
        <ul className="vault-errors">
          {(v.errors?.length ? v.errors : ['(no error text)']).map((e) => (
            <li key={e}>
              Vault said: <code>{tidy(e)}</code>
            </li>
          ))}
        </ul>
      )}
      {wink && <p className="wink">{wink}</p>}
      <Said v={v} />
    </div>
  );
}

function Keyhole({ filled, label }) {
  return (
    <svg className={`keyhole${filled ? ' keyhole--filled' : ''}`} viewBox="0 0 48 64" role="img" aria-label={label}>
      <rect className="keyhole__plate" x="2" y="2" width="44" height="60" rx="10" />
      <path className="keyhole__hole" d="M24 14a8 8 0 0 1 4.5 14.6L31 48H17l2.5-19.4A8 8 0 0 1 24 14z" />
    </svg>
  );
}

// The held request as Vault reports it (sys/control-group/request): the
// approvals Vault lists, and whether it now counts enough. The slots fill
// only when Vault says approved; the API never counts.
export function KeySlots({ request, needed = 2, view }) {
  if (!request && view?.opened) return <p className="m-0" role="status"><StatePill state="ok">released</StatePill> Vault has forgotten this request: a held request is opened once.</p>;
  if (!request) return <p className="dim">No held request yet.</p>;
  const by = request.by || [];
  const approved = request.approved;
  const members = by.filter((b) => b.member).length;
  return (
    <div className="keyslots">
      <div className="keyslots__holes" aria-label={approved ? 'Vault: approved' : 'Vault: not approved yet'}>
        {Array.from({ length: needed }, (_, i) => (
          <Keyhole key={i} filled={approved || (i < members && i < needed - 1)} label={`key ${i + 1} of ${needed}`} />
        ))}
      </div>
      <div className="keyslots__text">
        <StatePill state={approved ? 'ok' : 'warn'}>{approved ? 'approved: Vault releases it' : 'held: not enough eligible approvals'}</StatePill>
        <ul className="approvers" aria-label="Approvals Vault lists">
          {by.length === 0 && <li className="dim">No approvals yet.</li>}
          {by.map((b) => (
            <li key={b.entity_id}>
              <strong>{b.name}</strong> {b.member ? <span className="dim">in governor-keyholders</span> : <StatePill state="denied">not in governor-keyholders</StatePill>}
            </li>
          ))}
        </ul>
        <p className="dim m-0">
          accessor <code className="mono">{request.accessor}</code>
        </p>
      </div>
    </div>
  );
}

export const wink = {
  ticket: 'No ticket, no night shift heroics.',
  one: 'One key is an opinion. Two are a decision.',
  outsider: 'Jonas pressed the button. Vault wrote it down and did not count it.',
  once: 'A break-glass value opens once. The glass stays broken.',
  target: 'The key may change its nature, but only into what the rule allows.',
  left: 'An approval policy is only as current as the people behind its group.',
  ledger: 'Vault never wrote down the code. It wrote down who asked for it.',
};
