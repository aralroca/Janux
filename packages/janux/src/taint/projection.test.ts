import { describe, expect, it } from 'bun:test';
import { component, store } from '../define/factories';
import { list, schema, str } from '../schema';
import { buildManifest } from '../manifest';
import { createInstance } from '../runtime/instance';

const threadDef = () =>
  component({
    name: 'thread',
    description: 'A discussion',
    state: schema({ topic: str(), replies: list({ body: str().untrusted() }) }),
    view: () => null,
  });

const settingsDef = () => store({ name: 'settings', state: schema({ theme: str() }) });

describe('untrusted state in the agent-facing projections', () => {
  it('the manifest resource names the untrusted paths', () => {
    const manifest = buildManifest([{ def: threadDef() }, { def: settingsDef() }]);
    const thread = manifest.resources.find((resource) => resource.uri === 'ui://thread');

    expect(thread!.untrusted).toEqual(['replies[].body']);
  });

  it('a resource with nothing untrusted says nothing', () => {
    const manifest = buildManifest([{ def: settingsDef() }]);

    expect(manifest.resources[0]!.untrusted).toBeUndefined();
  });

  it('the live resource read carries the same paths as the manifest', () => {
    const instance = createInstance(threadDef(), { initial: { topic: 't', replies: [{ body: 'x' }] } });

    expect(instance.resource().untrusted).toEqual(['replies[].body']);
  });
});
