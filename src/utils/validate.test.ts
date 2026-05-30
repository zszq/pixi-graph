import { describe, it, expect } from 'vitest';
import { isInteger, isUrl } from './validate';

describe('isInteger', () => {
  it('accepts finite integers', () => {
    expect(isInteger(0)).toBe(true);
    expect(isInteger(42)).toBe(true);
    expect(isInteger(-7)).toBe(true);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(NaN)).toBe(false);
    expect(isInteger(Infinity)).toBe(false);
    expect(isInteger('5')).toBe(false);
    expect(isInteger(null)).toBe(false);
    expect(isInteger(undefined)).toBe(false);
  });
});

describe('isUrl', () => {
  it('accepts http(s) urls', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://localhost:3000/path')).toBe(true);
  });

  it('rejects plain strings', () => {
    expect(isUrl('not a url')).toBe(false);
    expect(isUrl('person')).toBe(false);
    expect(isUrl('')).toBe(false);
  });
});
