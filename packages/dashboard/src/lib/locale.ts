/**
 * Format-locale picker - governs only how numbers and dates look on
 * screen (thousand separators, date layout, time format). NOT the UI
 * language: that lives in `lib/i18n.ts` and is driven by the
 * Lingui-backed LanguagePicker dropdown in the header. The two
 * settings are deliberately independent so an operator can run the UI
 * in Dutch but keep "1,234.56" comma-decimal display, or vice versa.
 *
 * Persists to localStorage as `braiins.displayLocale`. The `auto`
 * value means "follow `navigator.language`"; any other value is
 * passed directly to Intl APIs.
 */

import { useLingui } from '@lingui/react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  formatAge as formatAgeRaw,
  formatHashratePH as formatHashratePHRaw,
  formatNumber as formatNumberRaw,
  formatSatPerPH as formatSatPerPHRaw,
  formatSats as formatSatsRaw,
  formatTimestamp as formatTimestampRaw,
} from './format';

const STORAGE_KEY = 'braiins.displayLocale';

/**
 * Number/date format presets. Listed format-first (the example
 * separators + date layout) rather than language-first - the picker
 * is for *how numbers and dates look*, not for translation. The UI
 * language is a separate setting (see `lib/i18n.ts` and the
 * LanguagePicker in the header).
 */
export const LOCALE_PRESETS: Array<{ code: string; label: string }> = [
  { code: 'auto', label: 'system default' },
  { code: 'en-US', label: '1,234.56 · Apr 16, 2026 · 5:00 PM' },
  { code: 'en-GB', label: '1,234.56 · 16 Apr 2026 · 17:00' },
  { code: 'nl-NL', label: '1.234,56 · 16 apr 2026 · 17:00' },
  { code: 'de-DE', label: '1.234,56 · 16. Apr. 2026 · 17:00' },
  { code: 'fr-FR', label: '1\u202f234,56 · 16 avr. 2026 · 17:00' },
  { code: 'es-ES', label: '1.234,56 · 16 abr 2026 · 17:00' },
  { code: 'pt-BR', label: '1.234,56 · 16 de abr. de 2026 · 17:00' },
];

export function getStoredLocale(): string {
  return window.localStorage.getItem(STORAGE_KEY) ?? 'auto';
}

export function setStoredLocale(code: string): void {
  window.localStorage.setItem(STORAGE_KEY, code);
}

/**
 * Resolves the display locale to pass into Intl constructors. `auto`
 * becomes `undefined` (Intl default = browser locale).
 */
export function resolveLocale(selected: string): string | undefined {
  return selected === 'auto' ? undefined : selected;
}

export interface LocaleContextValue {
  selected: string;
  intlLocale: string | undefined;
  setSelected: (code: string) => void;
}

export const LocaleContext = createContext<LocaleContextValue>({
  selected: 'auto',
  intlLocale: undefined,
  setSelected: () => undefined,
});

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function useLocaleState(): LocaleContextValue {
  const [selected, setSelectedState] = useState(() => getStoredLocale());

  useEffect(() => {
    setStoredLocale(selected);
  }, [selected]);

  return {
    selected,
    intlLocale: resolveLocale(selected),
    setSelected: setSelectedState,
  };
}

/**
 * BCP-47 locale to use for *date and time* formatting. Derived from
 * the UI-language setting (Lingui), NOT from the format-preference
 * dropdown. Without this, picking a Dutch number/date format
 * preference would also switch the chart x-axis day-name
 * abbreviations and runway/next-payout month names to Dutch even
 * when the operator has the UI in English. The two settings are
 * supposed to be independent; this hook is the seam.
 *
 * Mapping:
 *   en -> en-US   (Mon / Apr / etc)
 *   nl -> nl-NL   (ma / apr / etc)
 *   es -> es-ES   (lun / abr / etc)
 *
 * Date layout (DMY vs MDY) follows the language locale for now.
 */
export function useDateTimeLocale(): string {
  const { i18n } = useLingui();
  switch (i18n.locale) {
    case 'nl':
      return 'nl-NL';
    case 'es':
      return 'es-ES';
    case 'en':
    default:
      return 'en-US';
  }
}

/**
 * Pre-bound formatters that use the current display locale. Components
 * call these like `fmt.satPerPH(n)` instead of `formatSatPerPH(n, locale)`.
 */
export function useFormatters() {
  const { intlLocale } = useLocale();
  return useMemo(
    () => ({
      number: (n: number, opts?: Intl.NumberFormatOptions) =>
        formatNumberRaw(n, opts, intlLocale),
      satPerPH: (n: number | null | undefined) => formatSatPerPHRaw(n, intlLocale),
      sats: (n: number | null | undefined) => formatSatsRaw(n, intlLocale),
      hashratePH: (n: number | null | undefined) => formatHashratePHRaw(n, intlLocale),
      timestamp: (ms: number | null | undefined) => formatTimestampRaw(ms, intlLocale),
      age: formatAgeRaw,
    }),
    [intlLocale],
  );
}
