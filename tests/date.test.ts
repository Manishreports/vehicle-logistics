import { describe, expect, it } from 'vitest';
import { parseHumanDate } from '../src/domain/date.js';

describe('date parser', () => {
  it.each([
    ['20-07-2026', '2026-07-20'], ['20/07/2026', '2026-07-20'], ['20.07.2026', '2026-07-20'], ['20-Jul-2026', '2026-07-20'], ['20-Jul-26', '2026-07-20'], ['2026-07-20', '2026-07-20']
  ])('%s parses deterministically', (input, expected) => expect(parseHumanDate(input)).toBe(expected));
  it('does not invent a date', () => expect(parseHumanDate('not a date')).toBe(''));
});
