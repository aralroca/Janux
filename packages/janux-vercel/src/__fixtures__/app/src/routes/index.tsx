import { jsx } from 'janux';
// A stand-in for a package that ships a platform binary (seeded by the tests
// into the fixture's node_modules): inlined by a plain bundle, kept as a bare
// specifier by `--native`.
import fakeNative from 'fake-native';

export default function Home() {
  return jsx('main', { 'data-native': fakeNative.marker, children: 'Deployed' });
}
