import { isTracing, otelTracer, setPiiFilter, setTracer, withSpan, type JanuxSpan, type SpanAttributes } from 'janux/observability';
import { recordingTracer } from '../../janux/src/observability/__fixtures__/recording-tracer';
import type { ScenarioCase } from '../support/scenario';

/**
 * The seam every instrumented path in the framework goes through, seen from the
 * side that matters most on a hot render loop: what an UNINSTRUMENTED app is
 * allowed to pay, and what an instrumented one is guaranteed regardless of how
 * badly its exporter behaves.
 *
 * `janux`'s own `tracing.test.ts` owns the happy path and the exporter-failure
 * matrix. These rows own the cost model — the attribute thunk is a thunk
 * precisely so an app with no tracer never builds an object it would throw away
 * — plus the parts of the contract the render pipeline leans on.
 */

/** Runs `body` with `tracer` registered, and always unregisters it. */
async function withTracer<T>(tracer: Parameters<typeof setTracer>[0], body: () => Promise<T>): Promise<T> {
  setTracer(tracer);
  try {
    return await body();
  } finally {
    setTracer(undefined);
  }
}

/** A span handle that records nothing but counts what it was asked to do. */
const inertSpan: JanuxSpan = { setAttributes: () => undefined, recordError: () => undefined };

export const OTEL_SEAM_CASES: ScenarioCase[] = [
  {
    id: 'otel-is-tracing-answers-for-the-tracer-that-is-registered-right-now',
    src: 'janux',
    run: async (log) => {
      log.push(`before=${isTracing()}`);
      await withTracer(recordingTracer(), async () => log.push(`during=${isTracing()}`));
      log.push(`after=${isTracing()}`);
    },
    expected: ['before=false', 'during=true', 'after=false'],
  },
  {
    id: 'otel-an-uninstrumented-app-never-builds-the-attributes-it-would-throw-away',
    src: 'janux',
    run: async (log) => {
      let built = 0;

      await withSpan('janux.render', () => {
        built += 1;

        return { 'janux.route': '/orders/[id]' };
      }, async () => undefined);
      log.push(`built=${built}`);
    },
    expected: ['built=0'],
  },
  {
    id: 'otel-a-hot-path-pays-one-thunk-per-span-and-only-when-a-tracer-exists',
    src: 'janux',
    run: async (log) => {
      let built = 0;
      const thunk = () => {
        built += 1;

        return { 'janux.island': 'cart' };
      };

      for (let call = 0; call < 50; call += 1) await withSpan('janux.island', thunk, async () => undefined);
      log.push(`untraced=${built}`);
      await withTracer(recordingTracer(), async () => {
        for (let call = 0; call < 3; call += 1) await withSpan('janux.island', thunk, async () => undefined);
      });
      log.push(`traced=${built}`);
    },
    expected: ['untraced=0', 'traced=3'],
  },
  {
    id: 'otel-the-attributes-are-built-before-the-work-starts-not-after-it-finishes',
    src: 'janux',
    run: async (log) => {
      const order: string[] = [];

      await withTracer(recordingTracer(), () =>
        withSpan('janux.render', () => {
          order.push('attributes');

          return {};
        }, async () => {
          order.push('work');
        }),
      );
      log.push(order.join(','));
    },
    expected: ['attributes,work'],
  },
  {
    id: 'otel-the-works-value-comes-back-unchanged-with-and-without-a-tracer',
    src: 'janux',
    run: async (log) => {
      const value = { rows: [1, 2, 3] };

      log.push(`untraced=${(await withSpan('x', () => ({}), async () => value)) === value}`);
      log.push(`traced=${(await withTracer(recordingTracer(), () => withSpan('x', () => ({}), async () => value))) === value}`);
    },
    expected: ['untraced=true', 'traced=true'],
  },
  {
    id: 'otel-a-span-is-ended-even-when-the-work-inside-it-throws',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await withTracer(tracer, async () => {
        await withSpan('janux.render', () => ({}), async () => {
          throw new Error('render boom');
        }).catch(() => undefined);
      });
      log.push(`ended=${tracer.spans[0]!.ended} errors=${tracer.spans[0]!.errors.length}`);
    },
    expected: ['ended=true errors=1'],
  },
  {
    id: 'otel-the-error-recorded-on-the-span-is-the-very-object-the-work-threw',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();
      const failure = new Error('identity');

      await withTracer(tracer, async () => {
        await withSpan('janux.render', () => ({}), async () => {
          throw failure;
        }).catch(() => undefined);
      });
      log.push(`same=${tracer.spans[0]!.errors[0] === failure}`);
    },
    expected: ['same=true'],
  },
  {
    id: 'otel-a-non-error-throw-reaches-the-span-handle-exactly-as-it-was-thrown',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await withTracer(tracer, async () => {
        await withSpan('janux.api', () => ({}), async () => {
          throw 'refused';
        }).catch(() => undefined);
      });
      log.push(`value=${JSON.stringify(tracer.spans[0]!.errors[0])}`);
    },
    expected: ['value="refused"'],
  },
  {
    id: 'otel-the-error-is-recorded-once-even-though-it-is-also-rethrown',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();
      let rethrown = '';

      await withTracer(tracer, async () => {
        await withSpan('janux.render', () => ({}), async () => {
          throw new Error('once');
        }).catch((error: Error) => {
          rethrown = error.message;
        });
      });
      log.push(`recorded=${tracer.spans[0]!.errors.length} rethrown=${rethrown}`);
    },
    expected: ['recorded=1 rethrown=once'],
  },
  {
    id: 'otel-an-attribute-discovered-mid-render-is-scrubbed-like-the-ones-it-started-with',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await withTracer(tracer, () =>
        withSpan('janux.api', () => ({ 'janux.origin': 'human' }), async (span) => {
          span.setAttributes({ 'janux.user': 'buyer@example.com', 'janux.count': 2 });
        }),
      );
      log.push(JSON.stringify(tracer.spans[0]!.attributes));
    },
    expected: ['{"janux.origin":"human","janux.user":"[email]","janux.count":2}'],
  },
  {
    id: 'otel-an-initial-attribute-is-scrubbed-before-the-tracer-ever-sees-it',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await withTracer(tracer, () =>
        withSpan('janux.render', () => ({ 'janux.route': '/u/buyer@example.com', 'janux.phone': '+34 600 123 456' }), async () => undefined),
      );
      log.push(JSON.stringify(tracer.spans[0]!.attributes));
    },
    expected: ['{"janux.route":"/u/[email]","janux.phone":"[phone]"}'],
  },
  {
    id: 'otel-each-attribute-value-is-put-through-the-filter-exactly-once',
    src: 'janux',
    run: async (log) => {
      const seen: string[] = [];

      setPiiFilter((value) => {
        seen.push(value);

        return value;
      });
      try {
        await withTracer(recordingTracer(), () => withSpan('janux.render', () => ({ 'janux.route': '/a', 'janux.method': 'GET' }), async () => undefined));
      } finally {
        setPiiFilter(undefined);
      }
      log.push(`filtered=${seen.join(',')}`);
    },
    expected: ['filtered=/a,GET'],
  },
  {
    id: 'otel-an-undefined-attribute-survives-the-seam-and-is-dropped-by-the-otel-bridge',
    src: 'janux',
    run: async (log) => {
      const recorder = recordingTracer();
      const exported: Array<Record<string, unknown>> = [];

      await withTracer(recorder, () => withSpan('janux.render', () => ({ 'janux.route': '/a', 'janux.missing': undefined }), async () => undefined));
      // `JSON.stringify` hides an undefined value, so the KEYS are what say
      // whether the seam kept the attribute or dropped it.
      log.push(`seam=${Object.keys(recorder.spans[0]!.attributes).join(',')}`);

      await withTracer(
        otelTracer({
          startActiveSpan: (_name, options, run) => {
            exported.push(options.attributes);

            return run({ setAttributes: () => undefined, recordException: () => undefined, setStatus: () => undefined, end: () => undefined });
          },
        }),
        () => withSpan('janux.render', () => ({ 'janux.route': '/a', 'janux.missing': undefined }), async () => undefined),
      );
      log.push(`otel=${Object.keys(exported[0]!).join(',')}`);
    },
    expected: ['seam=janux.route,janux.missing', 'otel=janux.route'],
  },
  {
    id: 'otel-the-otel-bridge-ends-the-span-before-with-span-hands-the-value-back',
    src: 'janux',
    run: async (log) => {
      const order: string[] = [];

      const value = await withTracer(
        otelTracer({
          startActiveSpan: (_name, _options, run) =>
            run({
              setAttributes: () => undefined,
              recordException: () => undefined,
              setStatus: () => undefined,
              end: () => order.push('end'),
            }),
        }),
        () => withSpan('janux.render', () => ({}), async () => 'html'),
      );

      order.push(`resolved:${value}`);
      log.push(order.join(','));
    },
    expected: ['end,resolved:html'],
  },
  {
    id: 'otel-the-otel-bridge-passes-the-span-name-through-untouched',
    src: 'janux',
    run: async (log) => {
      const names: string[] = [];

      await withTracer(
        otelTracer({
          startActiveSpan: (name, _options, run) => {
            names.push(name);

            return run({ setAttributes: () => undefined, recordException: () => undefined, setStatus: () => undefined, end: () => undefined });
          },
        }),
        async () => {
          await withSpan('janux.request', () => ({}), async () => undefined);
          await withSpan('janux.island', () => ({}), async () => undefined);
        },
      );
      log.push(names.join(','));
    },
    expected: ['janux.request,janux.island'],
  },
  {
    id: 'otel-a-span-handle-that-throws-on-set-attributes-does-not-fail-the-render',
    src: 'janux',
    run: async (log) => {
      const hostile = {
        span: <T,>(_name: string, _attributes: SpanAttributes, run: (span: JanuxSpan) => Promise<T>) =>
          run({
            setAttributes: () => {
              throw new Error('exporter closed');
            },
            recordError: () => undefined,
          }),
      };

      const html = await withTracer(hostile, () =>
        withSpan('janux.render', () => ({}), async (span) => {
          span.setAttributes({ 'janux.route': '/' });

          return '<main></main>';
        }),
      );

      log.push(`served=${html}`);
    },
    expected: ['served=<main></main>'],
  },
  {
    id: 'otel-a-tracer-that-never-touches-the-span-handle-is-still-a-valid-tracer',
    src: 'janux',
    run: async (log) => {
      const bare = {
        span: <T,>(_name: string, _attributes: SpanAttributes, run: (span: JanuxSpan) => Promise<T>) => run(inertSpan),
      };

      log.push(`value=${await withTracer(bare, () => withSpan('janux.render', () => ({}), async () => 'ok'))}`);
    },
    expected: ['value=ok'],
  },
  {
    id: 'otel-clearing-the-tracer-mid-flight-does-not-abandon-the-span-already-open',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      setTracer(tracer);
      try {
        await withSpan('janux.render', () => ({}), async () => {
          setTracer(undefined);
        });
      } finally {
        setTracer(undefined);
      }
      log.push(`ended=${tracer.spans[0]!.ended} tracing-now=${isTracing()}`);
    },
    expected: ['ended=true tracing-now=false'],
  },
  {
    id: 'otel-a-tracer-registered-mid-render-only-traces-what-comes-after-it',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      await withSpan('janux.render', () => ({}), async () => undefined);
      setTracer(tracer);
      try {
        await withSpan('janux.island', () => ({ 'janux.island': 'cart' }), async () => undefined);
      } finally {
        setTracer(undefined);
      }
      log.push(tracer.names().join(','));
    },
    expected: ['janux.island'],
  },
  {
    id: 'otel-a-custom-pii-filter-replaces-the-default-for-span-attributes-and-restores',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();

      setPiiFilter(() => '[hidden]');
      try {
        await withTracer(tracer, () => withSpan('janux.render', () => ({ 'janux.route': '/orders/42' }), async () => undefined));
      } finally {
        setPiiFilter(undefined);
      }
      const restored = recordingTracer();

      await withTracer(restored, () => withSpan('janux.render', () => ({ 'janux.route': '/orders/42' }), async () => undefined));
      log.push(`custom=${tracer.spans[0]!.attributes['janux.route']}`);
      log.push(`restored=${restored.spans[0]!.attributes['janux.route']}`);
    },
    expected: ['custom=[hidden]', 'restored=/orders/42'],
  },
  {
    id: 'otel-a-thunk-that-throws-costs-the-span-its-attributes-not-the-render',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();
      const html = await withTracer(tracer, () =>
        withSpan('janux.render', () => {
          throw new Error('bad attributes');
        }, async () => '<main></main>'),
      );

      log.push(`served=${html} attributes=${JSON.stringify(tracer.spans[0]!.attributes)}`);
    },
    expected: ['served=<main></main> attributes={}'],
  },
  {
    id: 'otel-fifty-nested-spans-do-not-lose-the-value-at-the-bottom',
    src: 'janux',
    run: async (log) => {
      const tracer = recordingTracer();
      const deep = (depth: number): Promise<number> =>
        depth === 0 ? Promise.resolve(0) : withSpan(`level.${depth}`, () => ({ depth }), async () => (await deep(depth - 1)) + 1);

      log.push(`value=${await withTracer(tracer, () => deep(50))}`);
      log.push(`spans=${tracer.spans.length} all-ended=${tracer.spans.every(({ ended }) => ended)}`);
    },
    expected: ['value=50', 'spans=50 all-ended=true'],
  },
];
