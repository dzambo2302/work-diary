import type { IsoDate } from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import type { DayEntryInput, DayTypeRow } from '../db/repository.js';
import { computeHours, spanMinutes, type TimeOfDay } from '../domain/times.js';
import { el } from './dom.js';
import { timeField } from './time-field.js';
import type { DayCell } from './day-model.js';
import { S, formatHours } from './strings.js';

export interface DayContext {
  day: IsoDate;
  cell: DayCell;
  types: readonly DayTypeRow[];
  theme: 'light' | 'dark';
  defaultStart: TimeOfDay;
  defaultEnd: TimeOfDay;
  breakMinutes: number;
  onSave(entry: DayEntryInput): void;
  onDelete(day: IsoDate): void;
}

export function renderDayView(root: HTMLElement, ctx: DayContext): void {
  const { cell, types, theme } = ctx;
  let selected = cell.typeCode;

  const startField = timeField({
    id: 'start', label: S.startLabel, value: cell.startTime ?? ctx.defaultStart,
    onInput: syncTotal, onCommit: save,
  });
  const endField = timeField({
    id: 'end', label: S.endLabel, value: cell.endTime ?? ctx.defaultEnd,
    onInput: syncTotal, onCommit: save,
  });
  const total = el('strong', { class: 'shift__total' });
  const breakHint = el('span', { class: 'shift__hint' });

  const noteInput = el('textarea', {
    class: 'field__input field__input--area', id: 'note', rows: 4,
    placeholder: S.notePlaceholder,
  });
  noteInput.value = cell.note ?? '';

  const picker = el('div', { class: 'picker', role: 'radiogroup', 'aria-label': S.typeLabel });
  const buttons = types.map((t, i) => {
    const btn = el('button', {
      class: 'picker__item', type: 'button', role: 'radio',
      'aria-checked': String(selected === t.code),
      'aria-label': `${t.labelSk} (${i + 1})`,
      onclick: () => { selected = t.code; sync(); save(); },
    }, [
      el('span', { class: 'picker__icon', html: iconSvg(t.code) }),
      el('span', { class: 'picker__label', textContent: t.labelSk }),
      el('kbd', { class: 'picker__key', textContent: String(i + 1) }),
    ]);
    btn.style.setProperty('--cell', theme === 'dark' ? t.colorDark : t.color);
    return btn;
  });
  picker.append(...buttons);

  function sync(): void {
    types.forEach((t, i) => {
      buttons[i]!.setAttribute('aria-checked', String(selected === t.code));
    });
  }

  /** The fields never hand out half-typed text, so this is always a real shift. */
  function shift(): [TimeOfDay, TimeOfDay] {
    return [startField.value(), endField.value()];
  }

  /** The hours are output, never input — they follow the two times on every keystroke. */
  function syncTotal(): void {
    const [start, end] = shift();
    const hours = computeHours(start, end, ctx.breakMinutes);
    total.textContent = `${formatHours(hours)} h`;
    const deducted = spanMinutes(start, end) - Math.round(hours * 60);
    breakHint.textContent =
      deducted > 0 ? S.breakDeducted.replace('{minutes}', String(deducted)) : '';
  }

  /** Saving is immediate — an explicit Save step would only add a way to lose work. */
  function save(): void {
    if (!selected) return;
    const [startTime, endTime] = shift();
    const note = noteInput.value.trim();
    ctx.onSave({
      day: ctx.day, typeCode: selected, startTime, endTime,
      note: note === '' ? null : note,
    });
  }

  noteInput.addEventListener('change', save);
  syncTotal();

  const badges = el('div', { class: 'day__badges' });
  if (cell.isToday) {
    badges.append(el('span', { class: 'badge badge--today', textContent: S.todayBadge }));
  }
  if (cell.holidayName) {
    badges.append(el('span', {
      class: 'badge',
      textContent: `${cell.holidayName} · ${cell.kind === 'rest' ? S.restDay : S.workingHoliday}`,
    }));
  }
  if (cell.kind === 'weekend') {
    badges.append(el('span', { class: 'badge', textContent: S.weekend }));
  }

  // The date itself is already the toolbar title; repeating it here would be
  // the same sentence twice on one screen.
  const children = [
    el('div', { class: 'field' }, [
        el('span', { class: 'field__label', textContent: S.typeLabel }),
        picker,
      ]),
      el('div', { class: 'day__row' }, [
        el('div', { class: 'shift' }, [
          el('label', { class: 'field', htmlFor: 'start' }, [
            el('span', { class: 'field__label', textContent: S.startLabel }),
            startField.input,
          ]),
          el('label', { class: 'field', htmlFor: 'end' }, [
            el('span', { class: 'field__label', textContent: S.endLabel }),
            endField.input,
          ]),
          el('div', { class: 'field shift__result', 'aria-live': 'polite' }, [
            el('span', { class: 'field__label', textContent: S.hoursLabel }),
            total,
            breakHint,
          ]),
        ]),
        el('label', { class: 'field field--grow', htmlFor: 'note' }, [
          el('span', { class: 'field__label', textContent: S.noteLabel }),
          noteInput,
        ]),
      ]),
    el('div', { class: 'day__actions' },
      cell.kind === 'entry'
        ? [el('button', {
            class: 'btn btn--danger', type: 'button', textContent: S.clearDay,
            onclick: () => ctx.onDelete(ctx.day),
          })]
        : [el('span', { class: 'subtle', textContent: S.noEntry })],
    ),
  ];

  if (badges.childElementCount > 0) children.unshift(badges);
  root.replaceChildren(el('div', { class: 'card day' }, children));
}
