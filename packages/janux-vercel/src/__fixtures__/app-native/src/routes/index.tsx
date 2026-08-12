import { jsx } from 'janux';
// A stand-in for a package that ships a platform binary (seeded by the tests
// into this fixture's node_modules): inlined by a plain bundle, kept as a bare
// specifier by `--native`. It lives in its own fixture because an in-process
// boot of the shared app cannot resolve a package seeded after the test
// process started — Bun's resolver has already cached the tree.
import fakeNative from 'fake-native';

export default function Home() {
  return jsx('main', { 'data-native': fakeNative.marker, children: 'Deployed native' });
}
