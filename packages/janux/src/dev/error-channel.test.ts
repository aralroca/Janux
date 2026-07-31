import { describe, expect, it } from 'bun:test';
import { onJanuxError, publishJanuxError, type JanuxErrorChain } from './error-channel';

const CHAIN: JanuxErrorChain = { kind: 'intent', component: 'cart', name: 'checkout' };

describe('dev error channel', () => {
  it('delivers the error and its Janux chain to every listener', () => {
    const seen: [unknown, JanuxErrorChain][] = [];
    const stopA = onJanuxError((error, chain) => seen.push([error, chain]));
    const stopB = onJanuxError((error, chain) => seen.push([error, chain]));
    const boom = new Error('boom');

    publishJanuxError(boom, CHAIN);
    stopA();
    stopB();

    expect(seen).toEqual([
      [boom, CHAIN],
      [boom, CHAIN],
    ]);
  });

  it('stops delivering once a listener unsubscribes', () => {
    const seen: unknown[] = [];
    const stop = onJanuxError((error) => seen.push(error));

    stop();
    publishJanuxError(new Error('after'), CHAIN);

    expect(seen).toEqual([]);
  });

  /**
   * The channel exists to *watch* failures, never to own them: the original
   * error is rethrown by the pipeline that published it, so a listener that
   * blows up must not become the error the app sees instead.
   */
  it('survives a listener that throws, and keeps serving the others', () => {
    const seen: unknown[] = [];
    const stopBad = onJanuxError(() => {
      throw new Error('listener is broken');
    });
    const stopGood = onJanuxError((error) => seen.push(error));
    const boom = new Error('boom');

    expect(() => publishJanuxError(boom, CHAIN)).not.toThrow();
    expect(seen).toEqual([boom]);
    stopBad();
    stopGood();
  });

  it('is a no-op with nobody listening', () => {
    expect(() => publishJanuxError(new Error('unheard'), CHAIN)).not.toThrow();
  });
});
