import { batch, computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Modelling collections on top of identity-compared signals: the immutable
 * replacement discipline, a signal per row versus one signal for the list, and
 * the derived views (filter/sort/reduce/index) island code actually writes.
 */
export const COLLECTIONS_STATE_CASES: ScenarioCase[] = [
  {
    id: 'rx-co-appending-via-replacement-notifies',
    src: 'janux',
    run: (log) => {
      const items = signal<number[]>([1]);

      watch(() => { log.push(`items:${items.value.join(',')}`); });
      items.value = [...items.peek(), 2];
    },
    expected: ['items:1', 'items:1,2'],
  },
  {
    id: 'rx-co-a-derived-filter-recomputes-per-list-write',
    src: 'janux',
    run: (log) => {
      const items = signal([1, 2, 3]);
      const evens = computed(() => items.value.filter((n) => n % 2 === 0));

      watch(() => { log.push(`evens:${evens.value.join(',')}`); });
      items.value = [...items.peek(), 4];
    },
    expected: ['evens:2', 'evens:2,4'],
  },
  {
    id: 'rx-co-a-derived-total-dedupes-when-the-sum-is-unchanged',
    src: 'janux',
    run: (log) => {
      const items = signal([1, 2]);
      const total = computed(() => items.value.reduce((sum, n) => sum + n, 0));

      watch(() => { log.push(`total:${total.value}`); });
      items.value = [2, 1];
      items.value = [3];
    },
    expected: ['total:3'],
  },
  {
    id: 'rx-co-a-derived-sort-does-not-mutate-the-source-array',
    src: 'janux',
    run: (log) => {
      const items = signal([3, 1, 2]);
      const sorted = computed(() => [...items.value].sort((a, b) => a - b));

      watch(() => { log.push(`sorted:${sorted.value.join(',')}`); });
      log.push(`source:${items.peek().join(',')}`);
    },
    expected: ['sorted:1,2,3', 'source:3,1,2'],
  },
  {
    id: 'rx-co-a-row-signal-per-item-isolates-updates',
    src: 'janux',
    run: (log) => {
      const rows = [signal('a'), signal('b')];

      rows.forEach((row, index) => {
        watch(() => { log.push(`row${index}:${row.value}`); });
      });
      rows[1]!.value = 'b2';
    },
    expected: ['row0:a', 'row1:b', 'row1:b2'],
  },
  {
    id: 'rx-co-a-keys-signal-plus-a-cell-map-tracks-both-shape-and-content',
    src: 'janux',
    run: (log) => {
      const cells = new Map<string, ReturnType<typeof signal<number>>>();
      const keys = signal(['a']);
      const cell = (key: string) => {
        if (!cells.has(key)) cells.set(key, signal(0));

        return cells.get(key)!;
      };

      watch(() => {
        log.push(`view:${keys.value.map((key) => `${key}=${cell(key).value}`).join(',')}`);
      });
      cell('a').value = 1;
      keys.value = ['a', 'b'];
      cell('b').value = 2;
    },
    expected: ['view:a=0', 'view:a=1', 'view:a=1,b=0', 'view:a=1,b=2'],
  },
  {
    id: 'rx-co-removing-a-key-detaches-its-cell-from-the-view',
    src: 'janux',
    run: (log) => {
      const keys = signal(['a', 'b']);
      const cells = { a: signal(1), b: signal(2) };

      watch(() => {
        log.push(`view:${keys.value.map((key) => cells[key as 'a' | 'b'].value).join(',')}`);
      });
      keys.value = ['a'];
      cells.b.value = 99;
      log.push(`b-readers:${cells.b.readers()}`);
    },
    expected: ['view:1,2', 'view:1', 'b-readers:0'],
  },
  {
    id: 'rx-co-a-derived-index-lookup-follows-the-id-signal',
    src: 'janux',
    run: (log) => {
      const rows = signal([
        { id: 1, name: 'ada' },
        { id: 2, name: 'grace' },
      ]);
      const selectedId = signal(1);
      const selected = computed(() => rows.value.find((row) => row.id === selectedId.value));

      watch(() => { log.push(`selected:${selected.value?.name ?? 'none'}`); });
      selectedId.value = 2;
      selectedId.value = 3;
    },
    expected: ['selected:ada', 'selected:grace', 'selected:none'],
  },
  {
    id: 'rx-co-a-batched-multi-row-update-renders-the-aggregate-once',
    src: 'janux',
    run: (log) => {
      const rows = [signal(1), signal(2), signal(3)];
      const total = computed(() => rows.reduce((sum, row) => sum + row.value, 0));

      watch(() => { log.push(`total:${total.value}`); });
      batch(() => {
        rows.forEach((row) => {
          row.value = row.peek() * 10;
        });
      });
    },
    expected: ['total:6', 'total:60'],
  },
  {
    id: 'rx-co-a-derived-set-membership-check-dedupes-unrelated-list-writes',
    src: 'janux',
    run: (log) => {
      const tags = signal(['a', 'b']);
      const hasA = computed(() => tags.value.includes('a'));

      watch(() => { log.push(`has-a:${hasA.value}`); });
      tags.value = ['a', 'c'];
      tags.value = ['c'];
    },
    expected: ['has-a:true', 'has-a:false'],
  },
  {
    id: 'rx-co-a-paged-slice-notifies-only-when-the-page-content-changes',
    src: 'janux',
    run: (log) => {
      const items = signal([1, 2, 3, 4]);
      const page = signal(0);
      const visible = computed(() => items.value.slice(page.value * 2, page.value * 2 + 2).join(','));

      watch(() => { log.push(`page:${visible.value}`); });
      page.value = 1;
      items.value = [1, 2, 3, 4];
      page.value = 0;
    },
    expected: ['page:1,2', 'page:3,4', 'page:1,2'],
  },
  {
    id: 'rx-co-a-grouped-count-map-is-a-fresh-object-so-it-always-notifies',
    src: 'janux',
    run: (log) => {
      const items = signal(['a', 'b', 'a']);
      const counts = computed(() =>
        items.value.reduce<Record<string, number>>((acc, item) => {
          acc[item] = (acc[item] ?? 0) + 1;

          return acc;
        }, {}),
      );

      watch(() => { log.push(`counts:${JSON.stringify(counts.value)}`); });
      items.value = ['a', 'b', 'a'];
    },
    expected: ['counts:{"a":2,"b":1}', 'counts:{"a":2,"b":1}'],
  },
  {
    id: 'rx-co-a-two-level-derived-pipeline-filters-then-formats',
    src: 'janux',
    run: (log) => {
      const items = signal([1, 2, 3]);
      const evens = computed(() => items.value.filter((n) => n % 2 === 0));
      const label = computed(() => `${evens.value.length} even`);

      watch(() => { log.push(`label:${label.value}`); });
      items.value = [1, 3, 5];
      items.value = [2, 4];
    },
    expected: ['label:1 even', 'label:0 even', 'label:2 even'],
  },
  {
    id: 'rx-co-a-nested-object-signal-needs-a-new-outer-object-to-notify',
    src: 'janux',
    run: (log) => {
      const form = signal({ user: { name: 'ada' } });

      watch(() => { log.push(`name:${form.value.user.name}`); });
      form.peek().user.name = 'grace';
      log.push('mutated-silently');
      form.value = { user: { name: 'grace' } };
    },
    expected: ['name:ada', 'mutated-silently', 'name:grace'],
  },
  {
    id: 'rx-co-removing-an-item-by-filter-notifies-through-the-replacement',
    src: 'janux',
    run: (log) => {
      const items = signal([1, 2, 3]);

      watch(() => { log.push(`items:${items.value.join(',')}`); });
      items.value = items.peek().filter((n) => n !== 2);
    },
    expected: ['items:1,2,3', 'items:1,3'],
  },
  {
    id: 'rx-co-a-derived-first-item-dedupes-while-the-head-is-unchanged',
    src: 'janux',
    run: (log) => {
      const items = signal(['a', 'b']);
      const head = computed(() => items.value[0] ?? '');

      watch(() => { log.push(`head:${head.value}`); });
      items.value = ['a', 'c'];
      items.value = ['z', 'c'];
    },
    expected: ['head:a', 'head:z'],
  },
  {
    id: 'rx-co-a-selection-set-modelled-as-a-derived-key-string-tracks-membership',
    src: 'janux',
    run: (log) => {
      const selected = signal<string[]>([]);
      const isSelected = (id: string) => computed(() => selected.value.includes(id));
      const rowA = isSelected('a');

      watch(() => { log.push(`a:${rowA.value}`); });
      selected.value = ['b'];
      selected.value = ['a', 'b'];
    },
    expected: ['a:false', 'a:true'],
  },
  {
    id: 'rx-co-a-row-count-derived-from-a-map-of-cells-follows-the-keys-signal',
    src: 'janux',
    run: (log) => {
      const keys = signal(['a', 'b']);
      const cells = { a: signal(1), b: signal(2), c: signal(3) };
      const total = computed(() =>
        keys.value.reduce((sum, key) => sum + cells[key as 'a' | 'b' | 'c'].value, 0),
      );

      watch(() => { log.push(`total:${total.value}`); });
      keys.value = ['a', 'b', 'c'];
      cells.c.value = 30;
    },
    expected: ['total:3', 'total:6', 'total:33'],
  },
];
