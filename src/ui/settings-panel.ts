import type { IsoDate } from '../domain/dates.js';
import type { DayTypeCode } from '../domain/day-types.js';
import type { DayTypeRow, HolidayRow } from '../db/repository.js';
import { iconSvg } from '../domain/icons.js';
import {
  DEFAULT_END, DEFAULT_START, computeHours, isTimeOfDay, type TimeOfDay,
} from '../domain/times.js';
import { el } from './dom.js';
import { timeField } from './time-field.js';
import { S, formatHours, formatLongDate } from './strings.js';

export interface SettingsContext {
  settings: Record<string, string>;
  types: readonly DayTypeRow[];
  holidays: readonly HolidayRow[];
  year: number;
  theme: 'light' | 'dark';
  onSetting(key: string, value: string): void;
  onTypeColor(code: DayTypeCode, color: string, colorDark: string): void;
  onHoliday(day: IsoDate, isRestDay: boolean): void;
}

export function renderSettingsPanel(root: HTMLElement, ctx: SettingsContext): void {
  const defaultType = el('select', { class: 'field__input', id: 'default-type' },
    ctx.types.map((t) =>
      el('option', {
        value: t.code, textContent: t.labelSk,
        selected: ctx.settings.default_type === t.code,
      }),
    ),
  );
  defaultType.addEventListener('change', () => ctx.onSetting('default_type', defaultType.value));

  // The seeded working day is a shift now; its hours follow from the two times.
  const shiftField = (id: string, key: string, label: string, fallback: TimeOfDay) => {
    const stored = ctx.settings[key];
    return timeField({
      id, label, value: isTimeOfDay(stored) ? stored : fallback,
      onCommit: (value) => ctx.onSetting(key, value),
    });
  };
  const defaultStart =
    shiftField('default-start', 'default_start', S.settingsDefaultStart, DEFAULT_START);
  const defaultEnd =
    shiftField('default-end', 'default_end', S.settingsDefaultEnd, DEFAULT_END);
  const defaultHours = formatHours(computeHours(defaultStart.value(), defaultEnd.value()));

  const theme = el('select', { class: 'field__input', id: 'theme' }, [
    el('option', { value: 'system', textContent: S.themeSystem }),
    el('option', { value: 'light', textContent: S.themeLight }),
    el('option', { value: 'dark', textContent: S.themeDark }),
  ]);
  theme.value = ctx.settings.theme ?? 'system';
  theme.addEventListener('change', () => ctx.onSetting('theme', theme.value));

  const colors = el('div', { class: 'colors' },
    ctx.types.map((t) => {
      const light = el('input', {
        type: 'color', class: 'colors__swatch', value: t.color,
        'aria-label': `${t.labelSk} — ${S.themeLight}`,
      });
      const dark = el('input', {
        type: 'color', class: 'colors__swatch', value: t.colorDark,
        'aria-label': `${t.labelSk} — ${S.themeDark}`,
      });
      const push = () =>
        ctx.onTypeColor(t.code, light.value.toUpperCase(), dark.value.toUpperCase());
      light.addEventListener('change', push);
      dark.addEventListener('change', push);

      const row = el('div', { class: 'colors__row' }, [
        el('span', { class: 'colors__icon', html: iconSvg(t.code) }),
        el('span', { class: 'colors__label', textContent: t.labelSk }),
        light, dark,
      ]);
      row.style.setProperty('--cell', ctx.theme === 'dark' ? t.colorDark : t.color);
      return row;
    }),
  );

  // Legally uncertain days sort to the top, so a newly seeded year shows the
  // rows that actually need a decision first.
  const holidayRows = [...ctx.holidays]
    .sort((a, b) =>
      Number(b.needsVerification) - Number(a.needsVerification) || a.day.localeCompare(b.day))
    .map((h) => {
      const id = `h-${h.day}`;
      const toggle = el('input', { type: 'checkbox', id });
      toggle.checked = h.isRestDay;
      toggle.addEventListener('change', () => ctx.onHoliday(h.day, toggle.checked));

      return el('div', { class: `holiday${h.needsVerification ? ' holiday--check' : ''}` }, [
        el('span', { class: 'holiday__date', textContent: formatLongDate(h.day) }),
        el('span', { class: 'holiday__name', textContent: h.name }),
        h.needsVerification
          ? el('span', { class: 'badge badge--warn', textContent: S.holidayNeedsCheck })
          : el('span'),
        el('label', { class: 'holiday__toggle', htmlFor: id }, [
          toggle,
          el('span', { textContent: S.holidayIsRestDay }),
        ]),
      ]);
    });

  root.replaceChildren(
    el('section', { class: 'panel settings' }, [
      el('h2', { class: 'panel__title', textContent: S.settingsTitle }),
      el('div', { class: 'settings__row' }, [
        el('label', { class: 'field', htmlFor: 'default-type' }, [
          el('span', { class: 'field__label', textContent: S.settingsDefaultType }),
          defaultType,
        ]),
        el('label', { class: 'field', htmlFor: 'default-start' }, [
          el('span', { class: 'field__label', textContent: S.settingsDefaultStart }),
          defaultStart.input,
        ]),
        el('label', { class: 'field', htmlFor: 'default-end' }, [
          el('span', { class: 'field__label', textContent: S.settingsDefaultEnd }),
          defaultEnd.input,
        ]),
        el('div', { class: 'field' }, [
          el('span', { class: 'field__label', textContent: S.hoursLabel }),
          el('strong', { class: 'shift__total', textContent: `${defaultHours} h` }),
        ]),
        el('label', { class: 'field', htmlFor: 'theme' }, [
          el('span', { class: 'field__label', textContent: S.settingsTheme }),
          theme,
        ]),
      ]),
      el('p', { class: 'subtle', textContent: S.settingsShiftHint }),
      el('h3', { class: 'settings__heading', textContent: S.settingsColors }),
      colors,
      el('h3', { class: 'settings__heading', textContent: `${S.settingsHolidays} ${ctx.year}` }),
      el('p', { class: 'subtle', textContent: S.settingsHolidaysHint }),
      el('div', { class: 'holidays' }, holidayRows),
    ]),
  );
}
