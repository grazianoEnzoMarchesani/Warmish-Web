/**
 * Pure i18n core — no runes, safe to import anywhere, including the Web Worker
 * bundle (`batch.worker.ts`). All UI copy lives in `src/locales/<lang>.json`;
 * `translate(lang, 'a.b.c', { name })` looks the value up by dot path, fills
 * `{param}` placeholders and — when a `count` param is given and the value is an
 * object keyed by plural category — picks the right form with `Intl.PluralRules`.
 *
 * The reactive wrapper (`t`, `getLocale`, `setLocale`) lives in `i18n.svelte.ts`;
 * importing that into a worker bundle stalls the worker, so keep this file free
 * of `$state`.
 */
import it from '../locales/it.json';
import en from '../locales/en.json';

export type Locale = 'it' | 'en';

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
];

export const STORAGE_KEY = 'warmish.lang';

const DICTS: Record<Locale, unknown> = { it, en };

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    dict,
  );
}

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Translate into an explicit language. */
export function translate(
  lang: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  let value = lookup(DICTS[lang], key);
  if (value === undefined && lang !== 'it') value = lookup(DICTS.it, key); // fall back to the base language
  if (value && typeof value === 'object' && params && typeof params.count === 'number') {
    const forms = value as Record<string, string>;
    const cat = new Intl.PluralRules(lang).select(params.count);
    value = forms[cat] ?? forms.other ?? Object.values(forms)[0];
  }
  if (typeof value !== 'string') return key; // missing key — show the path, not a blank
  return fill(value, params);
}
