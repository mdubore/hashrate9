/**
 * #227: locale-aware number formatting for Telegram message bodies.
 *
 * Every alert body / title used to call `toLocaleString('en-US')` and
 * `.toFixed(N)` directly, so a Dutch or Spanish operator running with
 * `notification_locale: 'nl' | 'es'` received numbers with English
 * thousand and decimal separators regardless of their preference. This
 * module centralises the formatting so each call site picks up the
 * operator's `notification_locale` and Intl.NumberFormat picks the
 * appropriate separators.
 *
 * Co-located with `alert-copy.ts` because both are presentation logic
 * keyed off the same `notification_locale` and both should be updated
 * together if a new locale is added.
 *
 * The helpers all accept `string | null | undefined` for the locale so
 * callers can pass `state.config.notification_locale` directly without
 * a null check (matches `getAlertCopy`'s contract).
 */

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  nl: 'nl-NL',
  es: 'es-ES',
};

/**
 * Map the short `notification_locale` value to a BCP-47 tag suitable
 * for `Intl.NumberFormat`. Unknown / null / undefined falls back to
 * `en-US`, matching `getAlertCopy`'s fallback contract.
 */
export function localeTag(locale: string | null | undefined): string {
  if (!locale) return 'en-US';
  return LOCALE_MAP[locale] ?? 'en-US';
}

/**
 * Locale-aware thousands-separated integer. Drops any fractional part.
 * Use for sat counts, block heights, minute counters, anything where
 * the precision is whole-number.
 */
export function formatInteger(value: number, locale: string | null | undefined): string {
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 }).format(value);
}

/**
 * Locale-aware sat → BTC rendering with the canonical 8 decimal
 * places. Returns just the number (no unit) so the caller can decide
 * whether to suffix " BTC" or wrap differently.
 */
export function formatBtc(sat: number, locale: string | null | undefined): string {
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  }).format(sat / 1e8);
}

/**
 * Locale-aware "{integer} sat" rendering. Note: the unit literal `sat`
 * is intentionally not translated — it's the same token in EN / NL / ES
 * for "satoshi" in this project's vocabulary.
 */
export function formatSat(sat: number, locale: string | null | undefined): string {
  return `${formatInteger(sat, locale)} sat`;
}

/**
 * "X BTC (Y sat)" for amounts at-or-above 1 BTC; just "Y sat" for
 * smaller amounts. Mirrors the legacy `formatSatAsBtc` helper that
 * lived as a duplicate in `braiins-deposit-watcher.ts` (and as dead
 * code in `alert-evaluator.ts`); both now route through this central
 * locale-aware version. The 1-BTC threshold matches the deposit
 * watcher's convention: sub-BTC deposits read more naturally as raw
 * sat counts; 1-BTC-and-up gets the BTC framing because the integer
 * sat count is no longer scannable at a glance.
 *
 * Callers that always want the BTC framing (e.g. the payout-lifecycle
 * messages where the amount is typically well below 1 BTC but the
 * BTC denomination is still meaningful to the operator) should
 * compose `formatBtc` + `formatInteger` directly.
 */
export function formatSatAmount(sat: number, locale: string | null | undefined): string {
  if (sat >= 100_000_000) {
    return `${formatBtc(sat, locale)} BTC (${formatInteger(sat, locale)} sat)`;
  }
  return formatSat(sat, locale);
}

/**
 * Locale-aware fixed-digit number. Pass `fractionDigits` for the exact
 * number of decimals (both min and max). Use for hashrates ("3.12
 * PH/s"), runway days ("4.1"), and share-rejection rates ("0.51%").
 */
export function formatFixed(
  value: number,
  fractionDigits: number,
  locale: string | null | undefined,
): string {
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Locale-aware percentage rendering: `formatFixed` followed by `%`.
 * The percent sign is a punctuation glyph and stays the same across
 * locales; only the numeric formatting differs.
 */
export function formatPct(
  value: number,
  fractionDigits: number,
  locale: string | null | undefined,
): string {
  return `${formatFixed(value, fractionDigits, locale)}%`;
}
