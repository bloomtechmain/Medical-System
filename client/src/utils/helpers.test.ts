import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatCurrency, formatDate, isExpiringSoon, isExpired, stockStatus } from './helpers';

afterEach(() => vi.useRealTimers());

describe('stockStatus', () => {
  // The boundary is the interesting part: "at the reorder level" must read as
  // low stock, not in stock, or the pharmacist is told to reorder one sale too
  // late.
  it('treats exactly-at-reorder-level as low stock', () => {
    expect(stockStatus(10, 10).label).toBe('Low Stock');
    expect(stockStatus(11, 10).label).toBe('In Stock');
  });

  it('distinguishes out of stock from low stock', () => {
    expect(stockStatus(0, 10).label).toBe('Out of Stock');
    expect(stockStatus(1, 10).label).toBe('Low Stock');
  });

  // A reorder level of 0 means "never warn", not "always warn".
  it('does not mark stock low when the reorder level is zero', () => {
    expect(stockStatus(5, 0).label).toBe('In Stock');
    expect(stockStatus(0, 0).label).toBe('Out of Stock');
  });
});

describe('expiry helpers', () => {
  it('counts a medicine expiring inside the window, but not one past it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));

    expect(isExpiringSoon('2026-06-20')).toBe(true);
    expect(isExpiringSoon('2026-08-01')).toBe(false);
    // Already expired is NOT "expiring soon" — the two lists are different
    // screens, and a negative difference must not count as upcoming.
    expect(isExpiringSoon('2026-05-01')).toBe(false);
    expect(isExpired('2026-05-01')).toBe(true);
    expect(isExpired('2026-07-01')).toBe(false);
  });

  it('treats a missing date as neither expiring nor expired', () => {
    expect(isExpiringSoon(null)).toBe(false);
    expect(isExpiringSoon(undefined)).toBe(false);
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });
});

describe('formatters', () => {
  // A null amount must render as a zero price, never "NaN" or "undefined" on
  // a receipt.
  it('renders a null or undefined amount as zero, not NaN', () => {
    for (const value of [null, undefined, 0]) {
      const out = formatCurrency(value as number | null | undefined);
      expect(out).not.toMatch(/NaN|undefined/);
      expect(out).toMatch(/0/);
    }
  });

  it('renders a missing date as an em dash rather than Invalid Date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });
});
