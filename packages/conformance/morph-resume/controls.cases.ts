import { morph } from '../../janux/src/client/morph';
import type { ScenarioCase } from '../support/scenario';

/**
 * Controlled inputs across a patch — where the attribute and the property disagree.
 *
 * A pristine input mirrors its `value` attribute; once the value has been set as a
 * property (what typing does) the browser's dirty-value flag makes the attribute
 * stop reflecting. `syncValue` adds one more rule on top: never write over the
 * control the user is currently in. Getting this wrong is how in-place patchers
 * eat keystrokes, so each rule gets its own row.
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

export const CONTROL_CASES: ScenarioCase[] = [
  {
    id: 'control-a-pristine-input-follows-the-new-value',
    src: 'morphdom:specialElHandlers#input',
    run: (log) => {
      const host = attached('<input value="ssr">');

      morph(host, incoming('<input value="fromState">'));
      log.push((host.firstChild as HTMLInputElement).value);
    },
    expected: ['fromState'],
  },
  {
    id: 'control-an-edited-but-unfocused-input-is-overwritten-by-state',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="ssr">');
      const input = host.firstChild as HTMLInputElement;

      input.value = 'typed';
      morph(host, incoming('<input value="fromState">'));
      log.push(input.value);
    },
    expected: ['fromState'],
  },
  {
    id: 'control-an-edited-focused-input-keeps-what-the-user-typed',
    src: 'morphdom:specialElHandlers#focused-input',
    run: (log) => {
      const host = attached('<input value="ssr">');
      const input = host.firstChild as HTMLInputElement;

      input.value = 'typed';
      input.focus();
      morph(host, incoming('<input value="fromState">'));
      log.push(`${input.value} focused=${document.activeElement === input}`);
    },
    expected: ['typed focused=true'],
  },
  {
    id: 'control-a-focused-input-still-takes-other-attribute-changes',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="ssr">');
      const input = host.firstChild as HTMLInputElement;

      input.value = 'typed';
      input.focus();
      morph(host, incoming('<input value="fromState" placeholder="hint">'));
      log.push(`${input.value} placeholder=${input.getAttribute('placeholder')}`);
    },
    expected: ['typed placeholder=hint'],
  },
  {
    id: 'control-an-unfocused-sibling-is-updated-while-the-focused-one-is-not',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="a"><input value="b">');
      const [first, second] = [...host.childNodes] as HTMLInputElement[];

      first!.value = 'typedA';
      second!.value = 'typedB';
      first!.focus();
      morph(host, incoming('<input value="A"><input value="B">'));
      log.push(`${first!.value}|${second!.value}`);
    },
    expected: ['typedA|B'],
  },
  {
    id: 'control-a-checkbox-takes-the-new-checked-state',
    src: 'morphdom:specialElHandlers#checkbox',
    run: (log) => {
      const host = attached('<input type="checkbox">');

      morph(host, incoming('<input type="checkbox" checked="">'));
      log.push(String((host.firstChild as HTMLInputElement).checked));
    },
    expected: ['true'],
  },
  {
    id: 'control-a-checkbox-can-be-unchecked-by-a-render',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="checkbox" checked="">');

      morph(host, incoming('<input type="checkbox">'));
      log.push(String((host.firstChild as HTMLInputElement).checked));
    },
    expected: ['false'],
  },
  {
    id: 'control-a-focused-checkbox-is-left-alone',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="checkbox">');
      const box = host.firstChild as HTMLInputElement;

      box.checked = true;
      box.focus();
      morph(host, incoming('<input type="checkbox">'));
      log.push(String(box.checked));
    },
    expected: ['true'],
  },
  {
    id: 'control-a-radio-takes-the-new-checked-state',
    src: 'janux',
    run: (log) => {
      const host = attached('<input type="radio" name="g">');

      morph(host, incoming('<input type="radio" name="g" checked="">'));
      log.push(String((host.firstChild as HTMLInputElement).checked));
    },
    expected: ['true'],
  },
  {
    id: 'control-a-select-takes-the-newly-selected-option',
    src: 'morphdom:specialElHandlers#select',
    run: (log) => {
      const host = attached('<select><option value="a">a</option><option value="b">b</option></select>');

      morph(host, incoming('<select><option value="a">a</option><option value="b" selected="">b</option></select>'));
      log.push((host.firstChild as HTMLSelectElement).value);
    },
    expected: ['b'],
  },
  {
    id: 'control-a-textarea-follows-the-new-value',
    src: 'janux',
    run: (log) => {
      const host = attached('<textarea>old</textarea>');

      morph(host, incoming('<textarea>new</textarea>'));
      log.push((host.firstChild as HTMLTextAreaElement).value);
    },
    expected: ['new'],
  },
  {
    id: 'control-an-edited-focused-textarea-keeps-what-the-user-typed',
    src: 'janux',
    run: (log) => {
      const host = attached('<textarea>old</textarea>');
      const area = host.firstChild as HTMLTextAreaElement;

      area.value = 'typed';
      area.focus();
      morph(host, incoming('<textarea>new</textarea>'));
      log.push(area.value);
    },
    expected: ['typed'],
  },
  {
    id: 'control-a-disabled-flag-is-added-and-removed',
    src: 'janux',
    run: (log) => {
      const host = attached('<button>go</button>');

      morph(host, incoming('<button disabled="">go</button>'));
      log.push(`on=${(host.firstChild as HTMLButtonElement).hasAttribute('disabled')}`);
      morph(host, incoming('<button>go</button>'));
      log.push(`off=${(host.firstChild as HTMLButtonElement).hasAttribute('disabled')}`);
    },
    expected: ['on=true', 'off=false'],
  },
  {
    id: 'control-the-input-node-itself-survives-a-patch',
    src: 'janux',
    run: (log) => {
      const host = attached('<input value="a">');
      const before = host.firstChild;

      morph(host, incoming('<input value="b">'));
      log.push(`same-node=${host.firstChild === before}`);
    },
    expected: ['same-node=true'],
  },
];
