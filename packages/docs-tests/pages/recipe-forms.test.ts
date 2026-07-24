import { describe, expect, it } from 'bun:test';
import { component, createInstance, enums, intent, jsx, renderToString, schema, str } from 'janux';

/**
 * The claims recipes/forms.md makes, asserted — including the one that
 * matters most: schema types do NOT coerce form strings, so the recipe
 * documents converting inside run().
 */

const Signup = component({
  name: 'signup',
  description: 'Newsletter signup',
  state: schema({ email: str().default(''), age: str().default('0'), optIn: str().default('') }),
  intents: {
    submit: intent({
      description: 'Subscribe an email address',
      input: schema({ email: str().min(3), age: str(), optIn: str().optional() }),
      run: ({ state, input }: any) => {
        state.email = input.email;
        state.age = String(Number(input.age));
        state.optIn = input.optIn === 'on' ? 'yes' : 'no';
      },
    }),
  },
  view: ({ intents }: any) =>
    jsx('form', {
      intent: intents.submit,
      children: [jsx('input', { name: 'email' }), jsx('input', { name: 'age' })],
    }),
});

describe('recipes/forms.md', () => {
  it('marks the form with the submit intent so delegation can find it', async () => {
    const { html } = await renderToString(jsx(Signup as any, {}), {});

    expect(html).toContain('data-jxform="signup#default:submit"');
  });

  it('takes the strings FormData produces and converts them in run', async () => {
    const instance = createInstance(Signup);

    await instance.attach();
    await instance.intents.submit({ email: 'ada@example.com', age: '42' });

    expect(instance.snapshot()).toMatchObject({ email: 'ada@example.com', age: '42' });
  });

  it('treats an absent checkbox as unchecked instead of failing', async () => {
    const instance = createInstance(Signup);

    await instance.attach();
    await instance.intents.submit({ email: 'grace@example.com', age: '1' });

    expect(instance.snapshot().optIn).toBe('no');
  });

  it('rejects input the schema refuses before run executes', async () => {
    const instance = createInstance(Signup);

    await instance.attach();

    await expect(instance.intents.submit({ email: 'x', age: '1' })).rejects.toThrow();
    expect(instance.snapshot().email).toBe(''); // run never ran
  });

  it('an agent submits the same intent without a form', async () => {
    const instance = createInstance(Signup, { onProposal: () => {} });

    await instance.attach();
    await instance.intents.submit({ email: 'agent@example.com', age: '7' }, { origin: 'agent' });

    expect(instance.snapshot().email).toBe('agent@example.com');
  });

  it('numeric and boolean schema types do NOT coerce form strings', async () => {
    const Strict = component({
      name: 'strict',
      state: schema({ n: str().default('') }),
      intents: {
        take: intent({ input: schema({ n: (await import('janux')).int() }), run: () => {} }),
      },
      view: () => jsx('div', {}),
    });
    const instance = createInstance(Strict);

    await instance.attach();

    await expect(instance.intents.take({ n: '42' } as any)).rejects.toThrow();
    await instance.intents.take({ n: 42 });
  });

  it('enums() validate the option value a select submits', async () => {
    const plan = enums(['free', 'pro']);
    const Plans = component({
      name: 'plans',
      state: schema({ plan }),
      intents: { pick: intent({ input: schema({ plan }), run: ({ state, input }: any) => (state.plan = input.plan) }) },
      view: () => jsx('div', {}),
    });
    const instance = createInstance(Plans);

    await instance.attach();
    await instance.intents.pick({ plan: 'pro' });

    expect(instance.snapshot().plan).toBe('pro');
    await expect(instance.intents.pick({ plan: 'enterprise' } as any)).rejects.toThrow();
  });
});
