import { describe, expect, it } from 'bun:test';
import { bool, component, createInstance, enums, int, intent, jsx, money, renderToString, schema, str, toJsonSchema, validate } from 'janux';

/**
 * The claims recipes/forms.md makes, asserted — including the ones that
 * matter most: schema types do NOT coerce form strings by default, and
 * `coerce: 'form'` converts them to what ONE typed schema means while the
 * same intent keeps accepting an agent's typed JSON.
 */

const Signup = component({
  name: 'signup',
  description: 'Newsletter signup',
  state: schema({ email: str().default(''), age: int().default(0), optIn: bool().default(false) }),
  intents: {
    submit: intent({
      description: 'Subscribe an email address',
      input: schema({ email: str().min(3), age: int().min(18), optIn: bool().default(false) }),
      coerce: 'form',
      run: ({ state, input }: any) => {
        state.email = input.email;
        state.age = input.age;
        state.optIn = input.optIn;
      },
    }),
  },
  view: ({ intents }: any) =>
    jsx('form', {
      onSubmit: intents.submit,
      children: [jsx('input', { name: 'email' }), jsx('input', { name: 'age' })],
    }),
});

describe('recipes/forms.md', () => {
  it('marks the form with the submit intent so delegation can find it', async () => {
    const { html } = await renderToString(jsx(Signup as any, {}), {});

    expect(html).toContain('data-jxform="signup#default:submit"');
  });

  it('coerce: "form" turns FormData strings into what the typed schema means', async () => {
    const instance = createInstance(Signup);

    await instance.attach();
    await instance.intents.submit({ email: 'ada@example.com', age: '42', optIn: 'on' });

    expect(instance.snapshot()).toMatchObject({ email: 'ada@example.com', age: 42, optIn: true });
  });

  it('treats an absent checkbox as false instead of failing', async () => {
    const instance = createInstance(Signup);

    await instance.attach();
    await instance.intents.submit({ email: 'grace@example.com', age: '30' });

    expect(instance.snapshot().optIn).toBe(false);
  });

  it('a blank numeric field stays invalid — "" never becomes 0', async () => {
    const instance = createInstance(Signup);

    await instance.attach();

    await expect(instance.intents.submit({ email: 'ada@example.com', age: '' })).rejects.toThrow(/age: expected int/);
  });

  it('rejects input the schema refuses before run executes', async () => {
    const instance = createInstance(Signup);

    await instance.attach();

    await expect(instance.intents.submit({ email: 'x', age: '30' })).rejects.toThrow();
    expect(instance.snapshot().email).toBe(''); // run never ran
  });

  it('the same intent accepts an agent\'s typed JSON, and the manifest stays typed', async () => {
    const instance = createInstance(Signup, { onProposal: () => {} });

    await instance.attach();
    await instance.intents.submit({ email: 'agent@example.com', age: 25, optIn: true }, { origin: 'agent' });

    expect(instance.snapshot().email).toBe('agent@example.com');
    expect((toJsonSchema(Signup.intents!.submit!.input!) as any).properties.age.type).toBe('integer');
  });

  it('money() is never scaled: minor units in, minor units out', () => {
    const donation = schema({ donation: money().min(0) });
    const Fund = component({
      name: 'fund',
      state: schema({ cents: int().default(0) }),
      intents: {
        give: intent({
          input: donation,
          coerce: 'form',
          run: ({ state, input }: any) => (state.cents = input.donation),
        }),
      },
      view: () => jsx('div', {}),
    });
    const instance = createInstance(Fund);

    return (async () => {
      await instance.attach();
      await instance.intents.give({ donation: '1250' });
      expect(instance.snapshot().cents).toBe(1250);
      // "12.5" parses to 12.5 — not an integer of minor units, so it still fails.
      await expect(instance.intents.give({ donation: '12.5' })).rejects.toThrow();
      expect(validate(donation, { donation: 12.5 }).ok).toBe(false);
    })();
  });

  it('without coerce, numeric and boolean schema types do NOT coerce form strings', async () => {
    const Strict = component({
      name: 'strict',
      state: schema({ n: str().default('') }),
      intents: {
        take: intent({ input: schema({ n: int() }), run: () => {} }),
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
