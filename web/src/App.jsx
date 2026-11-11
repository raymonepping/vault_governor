// App.jsx: the shell (vault_dance, vault_codex). Frosted rail, floating
// topbar, the chapters as hash routes, ←/→ between pages, ? for the shortcuts, the "Vault said"
// drawer with every answer this page received.
import { useCallback, useEffect, useState } from 'react';
import { Anchor, ScrollText, Scale, KeyRound, FileSignature, UserMinus, History, Layers3, LogOut, UserRound, ExternalLink, PanelLeftClose, PanelLeftOpen, Keyboard } from 'lucide-react';
import { call } from './api.js';
import { useResource, useRoute, useVaultLog } from './hooks.js';
import { AuthContext, Drawer, tidy } from './components/ui.jsx';
import Footer from './components/Footer.jsx';
import Overview from './pages/Overview.jsx';
import Rule from './pages/Rule.jsx';
import SecondKey from './pages/SecondKey.jsx';
import Algorithm from './pages/Algorithm.jsx';
import Left from './pages/Left.jsx';
import Ledger from './pages/Ledger.jsx';
import Layers from './pages/Layers.jsx';

export const PAGES = [
  { id: 'overview', label: 'The harbour', title: 'The Second Key', icon: Anchor, Page: Overview },
  { id: 'rule', label: 'The Rule', title: 'Prologue: The Rule', icon: Scale, Page: Rule },
  { id: 'second-key', label: 'I. The Second Key', title: 'Chapter I: The Second Key', icon: KeyRound, Page: SecondKey },
  { id: 'algorithm', label: "II. The Algorithm's Key", title: "Chapter II: The Algorithm's Second Key", icon: FileSignature, Page: Algorithm },
  { id: 'left', label: 'III. The Keyholder Who Left', title: 'Chapter III: The Keyholder Who Left', icon: UserMinus, Page: Left },
  { id: 'ledger', label: 'Epilogue: The Ledger', title: 'Epilogue: The Ledger', icon: History, Page: Ledger },
  { id: 'layers', label: 'Layers', title: 'How the house was built', icon: Layers3, Page: Layers },
];

function Brand() {
  return (
    <svg className="brand-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 2l12 7v14l-12 7-12-7V9z" fill="currentColor" />
      <circle cx="16" cy="14" r="3.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M16 17.2v5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const FOLD_KEY = 'vgov.sidebar.collapsed';
function readFolded() {
  try {
    return window.localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}
function writeFolded(v) {
  try {
    window.localStorage.setItem(FOLD_KEY, v ? '1' : '0');
  } catch {
    /* not remembered, still works */
  }
}

function NavLinks({ route, className, folded = false }) {
  return PAGES.map(({ id, label, icon: Icon }) => (
    <a key={id} href={`#/${id}`} className={`${className}${route === id ? ' active' : ''}`} aria-current={route === id ? 'page' : undefined} title={folded ? label : undefined}>
      <span className="nav-icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="nav-label">{label}</span>
    </a>
  ));
}

function ClusterPill({ health }) {
  const h = health.data;
  const usable = h?.nodes?.filter((n) => n.reachable && !n.sealed).length || 0;
  const state = health.error ? 'critical' : !h ? 'unknown' : h.ok && usable === 3 ? 'healthy' : h.ok ? 'pending' : 'critical';
  const version = h?.nodes?.find((n) => n.version)?.version;
  const text = health.error ? 'API unreachable' : !h ? 'checking…' : `${usable}/3 unsealed${version ? ` · ${version}` : ''}`;
  return (
    <span className={`cluster-pill ${state}`} role="status" aria-live="polite">
      <span className={`cluster-dot${state === 'healthy' ? ' live' : ''}`} aria-hidden="true" />
      <span className="cluster-label">{text}</span>
    </span>
  );
}

function Person({ me, onSignOut }) {
  const [open, setOpen] = useState(false);
  if (!me?.signedIn) return null;
  return (
    <div className="user-menu">
      <button type="button" className="persona" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="persona-dot persona-dot--auth" aria-hidden="true" />
        <UserRound size={13} aria-hidden="true" />
        <span>{me.user}</span>
      </button>
      {open && (
        <div className="user-menu-panel" role="dialog" aria-label="Signed in">
          <div className="umf-row umf-user">{me.user}, the duty engineer</div>
          <div className="umf-row umf-meta">Vault token for {Math.round((me.expires_in || 0) / 60)} more minutes</div>
          <div className="umf-row umf-meta">Vault policies: {(me.policies || []).join(', ') || 'none'}</div>
          <button type="button" className="umf-signout" onClick={onSignOut}>
            <LogOut size={12} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ←/→ between pages (not while typing), ? for the shortcuts.
function useKeys(route, onHelp) {
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('dialog[open], .vg-drawer'))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // The URL, not React state: a second key can arrive before the re-render.
      const current = window.location.hash.replace(/^#\/?/, '').split('?')[0] || route;
      const i = Math.max(0, PAGES.findIndex((p) => p.id === current));
      if (e.key === 'ArrowRight' && i < PAGES.length - 1) window.location.hash = `#/${PAGES[i + 1].id}`;
      else if (e.key === 'ArrowLeft' && i > 0) window.location.hash = `#/${PAGES[i - 1].id}`;
      else if (e.key === '?') onHelp();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, onHelp]);
}

function SaidEntry({ e }) {
  const v = e.body?.vault;
  return (
    <li className="said-item">
      <div className="said-head">
        <strong>{e.label}</strong>
        <span className={`said-status ${(v?.status ?? e.status) >= 200 && (v?.status ?? e.status) < 300 ? 'ok' : 'bad'}`}>
          {v ? `Vault ${v.status}` : `HTTP ${e.status || '–'}`}
        </span>
      </div>
      <code className="said-path">{v ? `${v.method} ${v.path} as ${v.as}` : `${e.method} ${e.path}`}</code>
      {v?.errors?.length > 0 && (
        <ul className="vault-errors">
          {v.errors.map((x) => (
            <li key={x}>
              <code>{tidy(x)}</code>
            </li>
          ))}
        </ul>
      )}
      {v?.request_id && <span className="dim said-rid">request {v.request_id}</span>}
      {!v && e.body?.error && <p className="m-0">{e.body.error}</p>}
    </li>
  );
}

export default function App() {
  const route = useRoute(PAGES.map((p) => p.id), 'overview');
  const page = PAGES.find((p) => p.id === route);
  const health = useResource('health', '/api/health', { intervalMs: 15000 });
  const me = useResource('me', '/api/me');
  const log = useVaultLog();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [folded, setFolded] = useState(readFolded);
  const onHelp = useCallback(() => setHelp(true), []);
  useKeys(route, onHelp);
  useEffect(() => {
    document.title = `${page.title} · The Second Key`;
  }, [page]);
  // GET /api/me answers 401 when nobody is signed in: that is "signed out".
  // A 401 wins over the last answer useResource keeps after an error.
  const signedIn = Boolean(me.data?.user) && me.error?.status !== 401;
  const auth = { ...(signedIn ? me.data : {}), signedIn, refresh: me.reload };
  const signOut = async () => {
    await call('Sign out', '/api/session/logout', { method: 'POST' }).catch(() => {});
    me.reload();
  };
  const toggleFold = () =>
    setFolded((f) => {
      writeFolded(!f);
      return !f;
    });

  return (
    <AuthContext.Provider value={auth}>
      <div className="vg-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className={`vg-sidebar${folded ? ' collapsed' : ''}`} aria-label="Pages">
          <div className="sidebar-brand">
            <Brand />
            <span className="brand-name">The Second Key</span>
          </div>
          <nav className="sidebar-nav" id="rail-nav">
            <NavLinks route={route} className="nav-item" folded={folded} />
          </nav>
          <div className="sidebar-footer">
            <button type="button" className="sidebar-toggle" onClick={toggleFold} aria-expanded={!folded} aria-controls="rail-nav" title={folded ? 'Expand the sidebar' : 'Collapse the sidebar'}>
              {folded ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              <span className="sr-only">{folded ? 'Expand the sidebar' : 'Collapse the sidebar'}</span>
            </button>
            <p className="sidebar-note">Vault Enterprise 2.2 · vault_governor</p>
          </div>
        </aside>

        <div className="vg-main">
          <div className="topbar-wrap">
            <header className="vg-topbar">
              <div className="topbar-left">
                <h1 className="page-title">{page.title}</h1>
              </div>
              <div className="topbar-right">
                <ClusterPill health={health} />
                <Person me={auth} onSignOut={signOut} />
                <button type="button" className="vault-link said-button" onClick={() => setDrawer(true)}>
                  <ScrollText aria-hidden="true" />
                  <span className="link-label">Vault said</span>
                  <span className="said-count">
                    {log.length}
                    <span className="sr-only"> answers</span>
                  </span>
                </button>
                <button type="button" className="vault-link said-button" onClick={onHelp} aria-label="Keyboard shortcuts">
                  <Keyboard aria-hidden="true" />
                </button>
                <a className="vault-link" href={`${health.data?.vaultUi || 'https://localhost:19401'}/ui/`} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  <span className="link-label">Vault UI</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </header>
            <nav className="mobile-nav" aria-label="Pages">
              <NavLinks route={route} className="mobile-nav__item" />
            </nav>
          </div>

          <main id="main" className="vg-content" tabIndex={-1}>
            <page.Page key={page.id} />
          </main>
          <Footer />
        </div>

        <Drawer open={drawer} title="Vault said" onClose={() => setDrawer(false)}>
          <p className="drawer-intro">Every answer this page received, newest first: the Vault call behind it, who made it, Vault's status and its errors verbatim. Never a token.</p>
          {log.length === 0 ? (
            <p className="dim">Nothing yet. Play a chapter.</p>
          ) : (
            <ol className="said-list">
              {log.map((e) => (
                <SaidEntry key={e.id} e={e} />
              ))}
            </ol>
          )}
        </Drawer>

        <Drawer open={help} title="Keyboard" onClose={() => setHelp(false)}>
          <dl className="facts">
            <dt>
              <kbd>→</kbd>
            </dt>
            <dd>next page</dd>
            <dt>
              <kbd>←</kbd>
            </dt>
            <dd>previous page</dd>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>this list</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>close a drawer</dd>
          </dl>
        </Drawer>
      </div>
    </AuthContext.Provider>
  );
}
