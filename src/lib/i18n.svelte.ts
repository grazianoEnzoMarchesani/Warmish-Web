/**
 * Reactive i18n — the runes layer over the pure core in `./i18n`.
 *
 * `current` is a `$state`, so every `t(...)` call in a component template re-runs
 * when the language changes. Non-component code (plain `.ts`, the export worker)
 * must import `translate` / `LOCALES` / `Locale` from `./i18n` directly — pulling
 * this `$state`-carrying module into the worker bundle stalls the worker.
 */
import { translate, STORAGE_KEY, type Locale } from './i18n';

export { LOCALES, translate, type Locale } from './i18n';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'it' || saved === 'en') return saved;
  } catch { /* private mode */ }
  // Italian is the project's original language and the default; English is opt-in
  // via the IT / EN switch in the top bar (the choice is then remembered).
  return 'it';
}

let current = $state<Locale>(initialLocale());

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
}

/** Reactive translate — re-runs wherever it is read when the locale changes. */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(current, key, params);
}
