export const meta = {
  title: 'Distress signals — Basecamp',
  description: 'The international signals, as a page that keeps working with no network.',
};

/** Content only: this page ships no island, so offline it costs the cache one HTML file. */
const SIGNALS = [
  ['Six blasts a minute', 'The distress call. Whistle, torch or shout — six, then a minute of silence.'],
  ['Three blasts a minute', 'The reply. It means you have been heard and help is on its way.'],
  ['Both arms raised in a Y', 'Yes, or: we need help. Seen from the air, this is the one that matters.'],
  ['One arm up, one down (N)', 'No, or: we do not need help.'],
];

export default function Signals() {
  return (
    <>
      <h1>Distress signals</h1>
      <p class="lede">The part of the guide worth having when nothing else loads.</p>

      <dl class="signals">
        {SIGNALS.map(([signal, meaning]) => (
          <div key={signal}>
            <dt>{signal}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
