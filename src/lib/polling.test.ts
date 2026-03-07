import { describe, expect, it } from 'vitest';
import { nextBackoffDelay, withJitter } from './polling';

describe('polling helpers', () => {
  it('caps backoff at configured maximum', () => {
    expect(nextBackoffDelay(10_000, 30_000)).toBe(20_000);
    expect(nextBackoffDelay(20_000, 30_000)).toBe(30_000);
  });

  it('keeps jitter close to base delay', () => {
    const value = withJitter(20_000, 0.2);
    expect(value).toBeGreaterThanOrEqual(16_000);
    expect(value).toBeLessThanOrEqual(24_000);
  });
});
