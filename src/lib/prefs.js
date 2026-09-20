// Stored preferences: whitelist every value, migrate removed ones, never trust chrome.storage contents.
import { AUTO, sanitizeLanguagePref } from './language.js';

export const TYPES = ['tldr', 'key-points', 'headline'];
export const LENGTHS = ['short', 'medium', 'long'];
export const STORAGE_KEYS = ['type', 'length', 'language'];
export const DEFAULT_PREFS = Object.freeze({ type: 'tldr', length: 'medium', language: AUTO });

/** Turn whatever chrome.storage.local returned into valid prefs (unknown / corrupted values -> defaults). */
export function parseStoredPrefs(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const type = s.type === 'teaser' ? 'tldr' : s.type; // the Teaser style was removed in 1.0.0
  return {
    type: TYPES.includes(type) ? type : DEFAULT_PREFS.type,
    length: LENGTHS.includes(s.length) ? s.length : DEFAULT_PREFS.length,
    language: sanitizeLanguagePref(s.language), // added in 1.1.0: absent -> Auto
  };
}
