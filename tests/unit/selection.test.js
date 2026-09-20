import { describe, it, expect } from 'vitest';
import { MIN_SELECTION_CHARS, MODE_AUTO, MODE_PAGE, cleanSelection, pickSelection, decideMode } from '../../src/lib/selection.js';

const long = 'word '.repeat(40).trim();

describe('pickSelection', () => {
  it('uses a selection at or above the threshold, below it signals whole page', () => {
    expect(pickSelection('a'.repeat(MIN_SELECTION_CHARS))).toHaveLength(MIN_SELECTION_CHARS);
    expect(pickSelection('a'.repeat(MIN_SELECTION_CHARS - 1))).toBe('');
    expect(pickSelection('')).toBe('');
    expect(pickSelection(undefined)).toBe('');
  });
  it('measures after whitespace clean-up, so padding cannot reach the threshold', () => {
    expect(pickSelection(`   \n\n\n${'a'.repeat(100)}\n\n\n   `)).toBe('');
    expect(cleanSelection('a \n\n\n\n b\r\nc')).toBe('a\n\nb\nc');
  });
  it('whole-page mode ignores any selection', () => {
    expect(pickSelection(long, MODE_PAGE)).toBe('');
    expect(pickSelection(long, MODE_AUTO)).toBe(long);
  });
});

describe('decideMode', () => {
  it('explicit choice wins', () => {
    expect(decideMode({ explicit: MODE_PAGE })).toBe(MODE_PAGE);
    expect(decideMode({ explicit: MODE_AUTO, current: MODE_PAGE })).toBe(MODE_AUTO);
  });
  it('a new trigger or a tab change resets to auto', () => {
    expect(decideMode({ fresh: true, current: MODE_PAGE })).toBe(MODE_AUTO);
    expect(decideMode({ tabChanged: true, current: MODE_PAGE })).toBe(MODE_AUTO);
  });
  it('option changes keep the current mode; junk is treated as auto', () => {
    expect(decideMode({ current: MODE_PAGE })).toBe(MODE_PAGE);
    expect(decideMode({ current: 'weird' })).toBe(MODE_AUTO);
    expect(decideMode()).toBe(MODE_AUTO);
  });
});
