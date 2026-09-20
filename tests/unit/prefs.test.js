import { describe, it, expect } from 'vitest';
import { parseStoredPrefs, DEFAULT_PREFS, STORAGE_KEYS } from '../../src/lib/prefs.js';

describe('parseStoredPrefs', () => {
  it('defaults when storage is empty or not an object', () => {
    for (const s of [undefined, null, {}, 'x', 5, []]) expect(parseStoredPrefs(s)).toEqual(DEFAULT_PREFS);
  });
  it('migrates 1.0.x prefs (no language key) to Auto and keeps their values', () => {
    expect(parseStoredPrefs({ type: 'key-points', length: 'long' })).toEqual({ type: 'key-points', length: 'long', language: 'auto' });
  });
  it('migrates the removed Teaser style', () => {
    expect(parseStoredPrefs({ type: 'teaser' }).type).toBe('tldr');
  });
  it('whitelists every field independently', () => {
    expect(parseStoredPrefs({ type: '"]),x', length: 7, language: 'pt' })).toEqual(DEFAULT_PREFS);
    expect(parseStoredPrefs({ type: 'headline', length: 'bogus', language: 'ja' })).toEqual({ type: 'headline', length: 'medium', language: 'ja' });
  });
  it('reads all three keys', () => {
    expect(STORAGE_KEYS).toEqual(['type', 'length', 'language']);
  });
});
