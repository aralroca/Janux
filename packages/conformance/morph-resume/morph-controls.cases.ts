import { morph } from '../../janux/src/client/morph';
import type { ScenarioCase } from '../support/scenario';

/**
 * Controlled inputs across a patch, second corpus: the rules
 * `controls.cases.ts` pins for a single input, exercised where they interact —
 * option lists that change in the same pass as the selection, radio groups,
 * multiple selects, dirty flags vs attribute reflection, and the properties
 * (`indeterminate`, `defaultValue`) the sync deliberately never touches.
 * `state → DOM` still means: properties win over user edits everywhere except
 * the control the user is focused on.
 */

/** A root attached to the document — `document.activeElement` needs it. */
function attached(markup: string): Element {
  const host = document.createElement('div');

  host.innerHTML = markup;
  document.body.append(host);

  return host;
}

function incoming(markup: string): Node[] {
  const holder = document.createElement('div');

  holder.innerHTML = markup;

  return [...holder.childNodes];
}

export const MORPH_CONTROL_CASES: ScenarioCase[] = [
  {
    id: 'morph-control-a-selection-arriving-with-its-option-is-applied',
    src: 'janux',
    run: (log) => {
      // Regression: `syncValue` used to run before the child pass, so a value
      // whose <option> arrived in the same morph selected nothing.
      const host = attached('<select><option value="a">a</option></select>');

      morph(host, incoming('<select><option value="a">a</option><option value="b" selected="">b</option></select>'));
      log.push((host.firstChild as HTMLSelectElement).value);
    },
    expected: ['b'],
  },
  {
    id: 'morph-control-removing-the-selected-option-falls-back-to-the-first',
    src: 'janux',
    run: (log) => {
      const host = attached('<select><option value="a">a</option><option value="b" selected="">b</option></select>');

      morph(host, incoming('<select><option value="a">a</option></select>'));
      log.push((host.firstChild as HTMLSelectElement).value);
    },
    expected: ['a'],
  },
  {
    id: 'morph-control-a-multiple-select-gains-both-selections',
    src: 'janux',
    run: (log) => {
      const host = attached('<select multiple=""><option value="a">a</option><option value="b">b</option></select>');

      morph(host, incoming('<select multiple=""><option value="a" selected="">a</option><option value="b" selected="">b</option></select>'));
      log.push([...(host.firstChild as HTMLSelectElement).options].map((option) => option.selected).join(','));
    },
    expected: ['true,true'],
  },
  {
    id: 'morph-control-a-multiple-select-drops-one-of-two-selections',
    src: 'janux',
    run: (log) => {
      const host = attached('<select multiple=""><option value="a" selected="">a</option><option value="b" selected="">b</option></select>');

      morph(host, incoming('<select multiple=""><option value="a" selected="">a</option><option value="b">b</option></select>'));
      log.push([...(host.firstChild as HTMLSelectElement).options].map((option) => option.selected).join(','));
    },
    expected: ['true,false'],
  },
  {
    id: 'morph-control-a-radio-group-moves-the-checked-state-coherently',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="radio" name="g" value="1" checked=""><input type="radio" name="g" value="2">');

      morph(host, incoming('<input type="radio" name="g" value="1"><input type="radio" name="g" value="2" checked="">'));
      const [first, second] = [...host.childNodes] as HTMLInputElement[];

      log.push(`${first!.checked},${second!.checked}`);
    },
    expected: ['false,true'],
  },
  {
    id: 'morph-control-a-render-can-clear-a-whole-radio-group',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="radio" name="g" value="1" checked=""><input type="radio" name="g" value="2">');

      morph(host, incoming('<input type="radio" name="g" value="1"><input type="radio" name="g" value="2">'));
      const [first, second] = [...host.childNodes] as HTMLInputElement[];

      log.push(`${first!.checked},${second!.checked}`);
    },
    expected: ['false,false'],
  },
  {
    id: 'morph-control-indeterminate-is-runtime-owned-and-survives',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="checkbox">');
      const box = host.firstChild as HTMLInputElement;

      box.indeterminate = true;
      morph(host, incoming('<input type="checkbox">'));
      log.push(String(box.indeterminate));
    },
    expected: ['true'],
  },
  {
    id: 'morph-control-a-focused-but-untouched-input-still-follows-the-attribute',
    src: 'janux',
    run: (log) => {
      // The focus guard protects user EDITS (the dirty value flag). A pristine
      // focused input mirrors its value attribute, so the attr sync shows
      // through — and the caret survives because no property write happened.
      const host = attached('<input value="hello">');
      const input = host.firstChild as HTMLInputElement;

      input.focus();
      input.setSelectionRange(2, 4);
      morph(host, incoming('<input value="state">'));
      log.push(`${input.value} caret=${input.selectionStart}-${input.selectionEnd}`);
    },
    expected: ['state caret=2-4'],
  },
  {
    id: 'morph-control-an-unfocused-toggled-checkbox-is-overwritten-by-state',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="checkbox">');
      const box = host.firstChild as HTMLInputElement;

      box.checked = true;
      morph(host, incoming('<input type="checkbox">'));
      log.push(String(box.checked));
    },
    expected: ['false'],
  },
  {
    id: 'morph-control-a-dirty-input-syncs-attribute-and-property-together',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="ssr">');
      const input = host.firstChild as HTMLInputElement;

      input.value = 'typed';
      morph(host, incoming('<input value="state">'));
      log.push(`prop=${input.value} attr=${input.getAttribute('value')}`);
    },
    expected: ['prop=state attr=state'],
  },
  {
    id: 'morph-control-form-reset-lands-on-the-new-render-defaults',
    src: 'janux',
    run: (log) => {
      const host = attached('<form><input value="v1"></form>');
      const form = host.firstChild as HTMLFormElement;
      const input = form.firstChild as HTMLInputElement;

      morph(host, incoming('<form><input value="v2"></form>'));
      input.value = 'typed';
      form.reset();
      log.push(input.value);
    },
    expected: ['v2'],
  },
  {
    id: 'morph-control-a-type-change-and-a-value-land-in-the-same-pass',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="text" value="words">');

      morph(host, incoming('<input type="number" value="42">'));
      const input = host.firstChild as HTMLInputElement;

      log.push(`${input.type}:${input.value}`);
    },
    expected: ['number:42'],
  },
  {
    id: 'morph-control-a-checkbox-value-attribute-is-its-submit-value-not-state',
    src: 'janux',
    run: (log) => {
      // The checkbox branch of the sync only writes `checked`; the `value`
      // attribute still syncs as a plain attribute and reflects into the
      // pristine property.
      const host = attached('<input type="checkbox" value="on" checked="">');
      const box = host.firstChild as HTMLInputElement;

      morph(host, incoming('<input type="checkbox" value="yes" checked="">'));
      log.push(`${box.value} checked=${box.checked}`);
    },
    expected: ['yes checked=true'],
  },
  {
    id: 'morph-control-output-value-follows-its-text-child-not-a-property-write',
    src: 'janux',
    run: (log) => {
      const host = attached('<output>3</output>');

      morph(host, incoming('<output>7</output>'));
      log.push((host.firstChild as HTMLOutputElement).value);
    },
    expected: ['7'],
  },
  {
    id: 'morph-control-an-input-inside-an-island-is-shielded-from-the-sync',
    src: 'janux',
    run: (log) => {
      const host = attached('<janux-island data-jx="form#1"><input value="a"></janux-island>');

      morph(host, incoming('<janux-island data-jx="form#1"><input value="b"></janux-island>'));
      log.push((host.querySelector('input') as HTMLInputElement).value);
    },
    expected: ['a'],
  },
  {
    id: 'morph-control-contenteditable-text-is-not-a-control-and-state-wins',
    src: 'janux',
    run: (log) => {
      const host = attached('<div contenteditable="true">draft</div>');
      const editor = host.firstChild as HTMLElement;

      (editor as any).focus?.();
      morph(host, incoming('<div contenteditable="true">saved</div>'));
      log.push(editor.textContent!);
    },
    expected: ['saved'],
  },
  {
    id: 'morph-control-a-keyed-move-does-not-skip-the-value-sync',
    src: 'janux',
    run: (log) => {
      const host = attached('<p>lead</p><input value="a">');

      morph(host, incoming('<input value="b"><p>lead</p>'));
      log.push((host.querySelector('input') as HTMLInputElement).value);
    },
    expected: ['b'],
  },
  {
    id: 'morph-control-an-entity-in-the-value-attribute-lands-decoded-in-the-property',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="plain">');

      morph(host, incoming('<input value="a &amp; b">'));
      log.push((host.firstChild as HTMLInputElement).value);
    },
    expected: ['a & b'],
  },
  {
    id: 'morph-control-a-file-input-never-takes-a-programmatic-value',
    src: 'janux',
    run: (log) => {
      // Filenames are user-granted capability, not state: the value write is
      // attempted like any control but a file input refuses it.
      const host = attached('<input type="file">');

      morph(host, incoming('<input type="file" value="C:\\evil.txt">'));
      log.push(`"${(host.firstChild as HTMLInputElement).value}"`);
    },
    expected: ['""'],
  },
  {
    id: 'morph-control-a-disabled-input-still-follows-state',
    src: 'janux',
    run: (log) => {
      // Disabled means not editable by the USER; the state sync is not the user.
      const host = attached('<input disabled="" value="a">');
      const input = host.firstChild as HTMLInputElement;

      input.value = 'stuck';
      morph(host, incoming('<input disabled="" value="b">'));
      log.push(input.value);
    },
    expected: ['b'],
  },
  {
    id: 'morph-control-two-radio-groups-stay-independent-in-one-pass',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="radio" name="g1" checked=""><input type="radio" name="g1"><input type="radio" name="g2" checked=""><input type="radio" name="g2">');

      morph(host, incoming('<input type="radio" name="g1"><input type="radio" name="g1" checked=""><input type="radio" name="g2" checked=""><input type="radio" name="g2">'));
      const radios = [...host.childNodes] as HTMLInputElement[];

      log.push(radios.map((radio) => radio.checked).join(','));
    },
    expected: ['false,true,true,false'],
  },
  {
    id: 'morph-control-two-selects-sync-independently-in-one-pass',
    src: 'janux',
    run: (log) => {
      const host = attached('<select><option value="a" selected="">a</option><option value="b">b</option></select><select><option value="x">x</option><option value="y" selected="">y</option></select>');

      morph(host, incoming('<select><option value="a">a</option><option value="b" selected="">b</option></select><select><option value="x" selected="">x</option><option value="y">y</option></select>'));
      const [first, second] = [...host.childNodes] as HTMLSelectElement[];

      log.push(`${first!.value},${second!.value}`);
    },
    expected: ['b,x'],
  },
];
