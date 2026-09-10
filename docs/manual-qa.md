# Manual QA checklist

The unit suite covers the domain and database layers. These are the things it
cannot reach — OPFS persistence, real Chrome behaviour, and how the thing looks.
Run through this after any change to `src/db/` or `src/ui/`.

Build and load first:

```bash
npm run build
```

`chrome://extensions` → Developer mode → Load unpacked → `dist/`.

## First run

- [ ] Clicking the toolbar icon opens the diary in a tab.
- [ ] The current year auto-fills: every Mon–Fri that is not a rest-day holiday
      shows the default type and 8 h (a 6:00–14:30 shift).
- [ ] A diary from an older version still totals the same after upgrading; its
      days read 06:00 with an end time that reproduces their old hours.
- [ ] Weekends and rest-day holidays are recessed and carry no entry.
- [ ] 1 September and (in 2026) 8 May and 15 September show a holiday name but
      are still filled as working days.

## Persistence — the one that matters

- [ ] Change a day, then reload the page: the change is still there.
- [ ] Close the tab, quit Chrome entirely, reopen, open the diary: still there.
- [ ] Reopening a year already seeded adds no duplicate entries.

## Views

- [ ] `Deň` / `Mesiac` / `Rok` switch, and the URL hash follows.
- [ ] `‹ ›` step by day, month and year respectively.
- [ ] `Dnes` returns to today without changing the current view.
- [ ] Clicking a cell in Rok or Mesiac opens that date in Deň.
- [ ] Year heatmap: every day type shows its own colour, legend matches.
- [ ] Hovering a heatmap cell shows a Slovak tooltip with type, shift, hours
      and note.

## Editing

- [ ] Selecting a type saves immediately — navigate away and back to confirm.
- [ ] Od / Do are time pickers; Počet hodín updates as they change and is not
      typeable.
- [ ] 6:00–14:30 reads 8 h with the break note; 8:00–10:00 reads 2 h with none.
- [ ] 22:00–06:30 reads 8 h rather than a negative span.
- [ ] Changing either time or the note saves on blur.
- [ ] `1`–`6` set the type and keep the existing shift.
- [ ] `←` / `→` move a day, `Esc` steps up a level.
- [ ] `Vymazať záznam` removes the entry; the day then reads *Bez záznamu*.
- [ ] A weekend or holiday can still be given an entry manually.

## Panels

- [ ] Štatistika totals match the visible period and re-scope per view.
- [ ] Slovak plurals are right: `1 deň`, `3 dni`, `12 dní`, `8 hodín`.
- [ ] Nastavenia: changing the default type or the default shift affects the
      *next* year seeded, not existing entries.
- [ ] Changing a type colour repaints the heatmap, month tints, picker and
      legend.
- [ ] The holiday list pins uncertain rows to the top with *Overte platnosť*;
      toggling one clears the badge and changes whether that day auto-fills.

## Theme

- [ ] The toolbar toggle flips light ↔ dark and the icon shows the theme you
      would switch *to*.
- [ ] The choice survives a reload.
- [ ] Nastavenia → *Podľa systému* follows the OS setting again.
- [ ] Both themes are legible: text contrast, focus rings, all six type colours
      still distinguishable.

## Export

- [ ] Záloha downloads a `.sqlite` that opens in a SQLite viewer with the
      expected `day_entry` rows.
- [ ] The notice then reads `Posledná záloha: <today>`.
- [ ] CSV opens in Excel with Slovak diacritics intact, split into columns,
      `06:00` / `14:00` in the Od and Do columns and `7,5` in Hodiny.
- [ ] Obnoviť asks in Slovak naming the entry count, and restoring reverts a
      change made after the backup.

## Layout and a11y

- [ ] No horizontal page scrollbar at 1180, 900 and 700 px — the year grid
      scrolls inside its own card instead.
- [ ] Tab reaches every control with a visible focus ring in both themes.
- [ ] Nothing in the UI is in English.
