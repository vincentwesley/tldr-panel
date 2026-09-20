import { describe, it, expect } from 'vitest';
import { LANGUAGES, SUPPORTED, AUTO, normalizeLang, sanitizeLanguagePref, resolveLanguage, chunkLanguage, footnote, languageName } from '../../src/lib/language.js';

describe('language list', () => {
  it('is the conservative default and always includes English', () => {
    expect(SUPPORTED).toEqual(['en', 'es', 'ja']);
    expect(LANGUAGES.every((l) => l.code && l.name)).toBe(true);
  });
});

describe('normalizeLang', () => {
  it.each([
    ['es-MX', 'es'],
    ['es_MX', 'es'],
    [' EN ', 'en'],
    ['ja', 'ja'],
    ['zh-Hant-TW', 'zh'],
    ['', ''],
    [undefined, ''],
    [null, ''],
    ['x-klingon', ''],
    ['<script>', ''],
    ['english', ''],
  ])('%j -> %j', (input, out) => expect(normalizeLang(input)).toBe(out));
});

describe('sanitizeLanguagePref', () => {
  it('keeps auto and supported codes, everything else becomes auto', () => {
    expect(sanitizeLanguagePref('auto')).toBe(AUTO);
    expect(sanitizeLanguagePref('es')).toBe('es');
    for (const bad of ['fr', 'ES', '', null, undefined, 5, {}, ['es'], '<img>']) expect(sanitizeLanguagePref(bad)).toBe(AUTO);
  });
});

describe('resolveLanguage', () => {
  it('Auto follows a supported page language', () => {
    expect(resolveLanguage({ pref: 'auto', pageLang: 'es-MX' })).toMatchObject({ outputLanguage: 'es', expectedInputLanguages: ['es'], pageSupported: true, auto: true });
    expect(resolveLanguage({ pageLang: 'ja' })).toMatchObject({ outputLanguage: 'ja', expectedInputLanguages: ['ja'] });
  });
  it('Auto falls back to English for an unsupported page language and flags it', () => {
    expect(resolveLanguage({ pageLang: 'fr' })).toMatchObject({ outputLanguage: 'en', expectedInputLanguages: ['en'], pageSupported: false, detected: 'fr' });
  });
  it('missing or junk page language means English without a warning', () => {
    for (const l of ['', undefined, 'zz9!']) expect(resolveLanguage({ pageLang: l })).toMatchObject({ outputLanguage: 'en', pageSupported: true });
  });
  it('an explicit choice sets the output only; the input still reflects the page', () => {
    expect(resolveLanguage({ pref: 'ja', pageLang: 'es' })).toMatchObject({ outputLanguage: 'ja', expectedInputLanguages: ['es'], auto: false });
    expect(resolveLanguage({ pref: 'en', pageLang: 'fr' })).toMatchObject({ outputLanguage: 'en', expectedInputLanguages: ['en'] });
  });
  it('a corrupted pref acts as Auto', () => {
    expect(resolveLanguage({ pref: 'klingon', pageLang: 'es' }).outputLanguage).toBe('es');
  });
  it('chunk summaries stay in the page language', () => {
    expect(chunkLanguage(resolveLanguage({ pref: 'ja', pageLang: 'es' }))).toEqual({ outputLanguage: 'es', expectedInputLanguages: ['es'] });
  });
});

describe('footnote', () => {
  it('is accurate for each case', () => {
    expect(footnote()).toMatch(/English by default/);
    expect(footnote({ pref: 'es' })).toContain(languageName('es'));
    expect(footnote({ pref: 'auto', resolved: resolveLanguage({ pageLang: 'ja' }) })).toContain(languageName('ja'));
    expect(footnote({ pref: 'auto', resolved: resolveLanguage({ pageLang: 'en' }) })).toMatch(/English/);
  });
});
