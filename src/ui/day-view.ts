import type { IsoDate } from '../domain/dates.js';
import { iconSvg } from '../domain/icons.js';
import type { DayEntry, DayTypeRow } from '../db/repository.js';
import { el } from './dom.js';
import type { DayCell } from './day-model.js';
import { S } from './strings.js';

export interface DayContext {
  day: IsoDate;
  cell: DayCell;
  types: readonly DayTypeRow[];
  theme: 'light' | 'dark';
  defaultHours: number;
  onSave(entry: DayEntry): void;
  onDelete(day: IsoDate): void;
}

export function renderDayView(root: HTMLElement, ctx: DayContext): void {
  const { cell, types, theme } = ctx;
  let selected = cell.typeCode;

  const hoursInput = el('input', {
    class: 'field__input', type: 'number', min: '0', max: '24', step: '0.25',
    id: 'hours', value: String(cell.hours ?? ctx.defaultHours),
  });

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

  /** Saving is immediate — a diary entry is one field, so an explicit Save
   *  step would only add a way to lose work. */
  function save(): void {
    if (!selected) return;
    const raw = Number(hoursInput.value.replace(',', '.'));
    const hours = Number.isFinite(raw) ? Math.min(24, Math.max(0, raw)) : ctx.defaultHours;
    hoursInput.value = String(hours);
    const note = noteInput.value.trim();
    ctx.onSave({ day: ctx.day, typeCode: selected, hours, note: note === '' ? null : note });
  }

  hoursInput.addEventListener('change', save);
  noteInput.addEventListener('change', save);

  const badges = el('div', { class: 'day__badges' });
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
        el('label', { class: 'field', htmlFor: 'hours' }, [
          el('span', { class: 'field__label', textContent: S.hoursLabel }),
          hoursInput,
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
