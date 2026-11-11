// pages/Overview.jsx: the harbour, the people and the three chapters.
import { KeyRound, FileSignature, UserMinus, Scale } from 'lucide-react';
import { useResource } from '../hooks.js';
import { useAuth, SignInNotice, Mono, TableScroll } from '../components/ui.jsx';
import { Hero } from '../components/story.jsx';

const CHAPTERS = [
  { id: 'rule', icon: Scale, title: 'The Rule', text: 'Read the policy before anything runs: the namespace, the protected paths, the keyholder group, two approvals, two Sentinel rules.' },
  { id: 'second-key', icon: KeyRound, title: 'I. The Second Key', text: 'Rowan needs the lock-gate recovery code at night. Vault holds the read until two keyholders approve.' },
  { id: 'algorithm', icon: FileSignature, title: "II. The Algorithm's Second Key", text: 'The release-signing key changes from ECDSA to ML-DSA. The same two keys turn before Vault makes the change.' },
  { id: 'left', icon: UserMinus, title: 'III. The Keyholder Who Left', text: 'Mara leaves while a request waits. HR changes the roster through SCIM; Vault decides what she can still do.' },
];

export default function Overview() {
  const me = useAuth();
  const s = useResource('story', '/api/story');
  const people = s.data?.story?.people || [];
  return (
    <>
      <Hero number="Kestrel Harbour Authority" title="Terraform writes the rule. Vault makes the people follow it." lede="One duty engineer, three keyholders, one contractor and a recovery code nobody should read alone. Every answer on these pages is Vault's, verbatim.">
        <div className="hero-tiles hero-tiles--four">
          {CHAPTERS.map(({ id, icon: Icon, title }) => (
            <a key={id} className="vg-tile hero-tile-text" href={`#/${id}`}>
              <Icon size={16} aria-hidden="true" /> {title}
            </a>
          ))}
        </div>
      </Hero>
      {!me.signedIn && <SignInNotice />}
      <div className="grid-2">
        <section className="vg-card stack" aria-labelledby="ch-h">
          <div className="card-head">
            <h3 id="ch-h">The night, in three chapters</h3>
          </div>
          <ol className="next-list">
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <a href={`#/${c.id}`}>
                  <strong>{c.title}</strong>
                </a>{' '}
                {c.text}
              </li>
            ))}
          </ol>
        </section>
        <section className="vg-card stack" aria-labelledby="people-h">
          <div className="card-head">
            <h3 id="people-h">The people</h3>
            <span className="card-sub">userpass in namespace <Mono>governor</Mono>; keyholders provisioned by HR through SCIM</span>
          </div>
          <TableScroll label="The people">
            <table className="vg-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">From</th>
                  <th scope="col">Policy</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.user}>
                    <td>
                      <strong>{p.name}</strong> <Mono>{p.user}</Mono>
                    </td>
                    <td>{p.title}</td>
                    <td>{p.source === 'scim' ? 'SCIM (HR)' : 'userpass'}</td>
                    <td className="nowrap">
                      <Mono>{p.policy}</Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <p className="explain m-0">
            The approve button comes from <Mono>gov-keyholder</Mono>. Whether an approval counts comes only from membership of <Mono>governor-keyholders</Mono>, which HR owns. Jonas has the button and not the membership.
          </p>
        </section>
      </div>
    </>
  );
}
