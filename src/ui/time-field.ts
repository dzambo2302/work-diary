import {
  isTimeOfDay, maskTimeInput, normalizeTimeInput, stepTime, type TimeOfDay,
} from '../domain/times.js';
import { el } from './dom.js';

/** Arrow keys move by the quarter hour the diary is kept in. */
const STEP_MINUTES = 15;

export interface TimeFieldOptions {
  id: string;
  label: string;
  value: TimeOfDay;
  /** Fires while typing, as soon as the text spells a whole time. */
  onInput?: (value: TimeOfDay) => void;
  /** Fires once the field settles: blur, Enter, or an arrow step. */
  onCommit?: (value: TimeOfDay) => void;
}

export interface TimeField {
  input: HTMLInputElement;
  /** Always a valid time — the field never hands out half-typed text. */
  value(): TimeOfDay;
}

/**
 * A 24-hour time field.
 *
 * `<input type="time">` would be the obvious control, but Chromium renders it in
 * the browser's UI locale with no way to override it, so an en-US browser shows
 * "02:30 PM" in this otherwise Slovak app. A masked text field is the only way
 * to guarantee 24-hour, and it keeps the arrow-key stepping that was worth
 * having. Type "1430" or "14:30"; a nonsense entry snaps back on blur.
 */
export function timeField(opts: TimeFieldOptions): TimeField {
  let committed = opts.value;

  const input = el('input', {
    class: 'field__input field__input--time',
    id: opts.id,
    type: 'text',
    inputMode: 'numeric',
    autocomplete: 'off',
    spellcheck: false,
    maxLength: 5,
    placeholder: '--:--',
    'aria-label': opts.label,
    value: committed,
  });

  function commit(next: TimeOfDay): void {
    committed = next;
    input.value = next;
    opts.onInput?.(next);
    opts.onCommit?.(next);
  }

  input.addEventListener('input', () => {
    const wasAtEnd = input.selectionStart === input.value.length;
    input.value = maskTimeInput(input.value);
    if (wasAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    // Follow along live once the text is a whole time, but don't save yet.
    if (isTimeOfDay(input.value)) {
      committed = input.value;
      opts.onInput?.(committed);
    }
  });

  input.addEventListener('blur', () => commit(normalizeTimeInput(input.value, committed)));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(normalizeTimeInput(input.value, committed));
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const from = normalizeTimeInput(input.value, committed);
    commit(stepTime(from, e.key === 'ArrowUp' ? STEP_MINUTES : -STEP_MINUTES));
  });

  return { input, value: () => committed };
}
