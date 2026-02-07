import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getAccountCardVariant, getPlanBadgeClasses } from '../utils/account';

/**
 * Feature: ui-ux-overhaul, Property 1: AccountCard State-Based Styling
 * Validates: Requirements 2.4, 5.2, 5.6, 5.7
 * 
 * For any AccountCard component with given account state (isActive, isBestCandidate, isTokenExpired):
 * - If isActive is true, the card SHALL have 'active' variant
 * - If isTokenExpired is true, the card SHALL have 'danger' variant (takes precedence)
 * - Otherwise, the card SHALL have 'default' variant
 */
describe('AccountCard - Property 1: State-Based Styling', () => {
  const fcConfig = { numRuns: 100 };

  it('should return danger variant when token is expired regardless of active state', () => {
    fc.assert(
      fc.property(fc.boolean(), (isActive) => {
        const variant = getAccountCardVariant(isActive, true);
        expect(variant).toBe('danger');
      }),
      fcConfig
    );
  });

  it('should return active variant when account is active and token is not expired', () => {
    const variant = getAccountCardVariant(true, false);
    expect(variant).toBe('active');
  });

  it('should return default variant when account is not active and token is not expired', () => {
    const variant = getAccountCardVariant(false, false);
    expect(variant).toBe('default');
  });

  it('should always return one of the valid variants', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isActive, isTokenExpired) => {
        const variant = getAccountCardVariant(isActive, isTokenExpired);
        expect(['default', 'active', 'danger']).toContain(variant);
      }),
      fcConfig
    );
  });

  it('should prioritize danger over active when both conditions are true', () => {
    // isActive = true, isTokenExpired = true -> should be danger
    const variant = getAccountCardVariant(true, true);
    expect(variant).toBe('danger');
  });

  // Plan Badge Tests
  describe('Plan Badge Styling', () => {
    it('should return correct badge for plus plan', () => {
      const badge = getPlanBadgeClasses('plus');
      expect(badge.text).toBe('Plus');
      expect(badge.classes).toContain('emerald');
    });

    it('should return correct badge for team plan', () => {
      const badge = getPlanBadgeClasses('team');
      expect(badge.text).toBe('Team');
      expect(badge.classes).toContain('blue');
    });

    it('should return correct badge for pro plan', () => {
      const badge = getPlanBadgeClasses('pro');
      expect(badge.text).toBe('Pro');
      expect(badge.classes).toContain('purple');
    });

    it('should return default badge for unknown plans', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['plus', 'team', 'pro'].includes(s)),
          (plan) => {
            const badge = getPlanBadgeClasses(plan);
            expect(badge.text).toBe(plan);
            expect(badge.classes).toContain('slate');
          }
        ),
        fcConfig
      );
    });

    it('should always return an object with text and classes properties', () => {
      fc.assert(
        fc.property(fc.string(), (plan) => {
          const badge = getPlanBadgeClasses(plan);
          expect(badge).toHaveProperty('text');
          expect(badge).toHaveProperty('classes');
          expect(typeof badge.text).toBe('string');
          expect(typeof badge.classes).toBe('string');
        }),
        fcConfig
      );
    });
  });
});
