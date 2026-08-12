/** The stand-in native package the tests seed into node_modules (see __fixtures__/fake-native.ts). */
declare module 'fake-native' {
  const fakeNative: { marker: string };
  export default fakeNative;
}
