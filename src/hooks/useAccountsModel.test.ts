import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountInfo } from '../types';
import {
  ACTIVE_USAGE_STALE_AFTER_MS,
  getRankedSwitchCandidates,
  isUsageFresh,
  normalizeSingleActiveAccount,
  normalizePoolMetadata,
  sortAccountsByWeeklyRule,
} from './useAccountsModel';

function createAccount(overrides: Partial<AccountInfo>): AccountInfo {
  return {
    id: overrides.id ?? 'account-id',
    name: overrides.name ?? 'account',
    email: overrides.email ?? 'account@example.com',
    planType: overrides.planType ?? 'plus',
    subscriptionEnd: overrides.subscriptionEnd ?? null,
    isActive: overrides.isActive ?? false,
    filePath: overrides.filePath ?? `${overrides.name ?? 'account'}.json`,
    authUpdatedAt: overrides.authUpdatedAt ?? 0,
    usage: overrides.usage,
    expiresAt: overrides.expiresAt,
    lastRefresh: overrides.lastRefresh ?? '',
    lastUsageUpdate: overrides.lastUsageUpdate,
    isTokenExpired: overrides.isTokenExpired,
    pool: overrides.pool,
  };
}

describe('useAccountsModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps pool priority into the supported range', () => {
    expect(normalizePoolMetadata({ priority: 999 }).priority).toBe(10);
    expect(normalizePoolMetadata({ priority: -10 }).priority).toBe(1);
    expect(normalizePoolMetadata({ priority: 4.6 }).priority).toBe(5);
  });

  it('sorts low-weekly accounts by usage ascending', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const sorted = sortAccountsByWeeklyRule([
      createAccount({
        name: 'higher',
        usage: { secondaryWindow: { usedPercent: 40, resetsAt: 1_700_010_000 } },
      }),
      createAccount({
        name: 'lower',
        usage: { secondaryWindow: { usedPercent: 20, resetsAt: 1_700_020_000 } },
      }),
    ]);

    expect(sorted.map((account) => account.name)).toEqual(['lower', 'higher']);
  });

  it('sorts >90 weekly accounts by sooner reset first', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const sorted = sortAccountsByWeeklyRule([
      createAccount({
        name: 'later-reset',
        usage: { secondaryWindow: { usedPercent: 95, resetsAt: 1_700_020_000 } },
      }),
      createAccount({
        name: 'sooner-reset',
        usage: { secondaryWindow: { usedPercent: 95, resetsAt: 1_700_005_000 } },
      }),
    ]);

    expect(sorted.map((account) => account.name)).toEqual(['sooner-reset', 'later-reset']);
  });

  it('treats accounts without a recent usage snapshot as stale', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const staleAccount = createAccount({
      usage: { primaryWindow: { usedPercent: 25 } },
      lastUsageUpdate: 1_700_000_000_000 - ACTIVE_USAGE_STALE_AFTER_MS - 1,
    });

    const freshAccount = createAccount({
      usage: { primaryWindow: { usedPercent: 25 } },
      lastUsageUpdate: 1_700_000_000_000 - 60_000,
    });

    expect(isUsageFresh(staleAccount, Date.now(), ACTIVE_USAGE_STALE_AFTER_MS)).toBe(false);
    expect(isUsageFresh(freshAccount, Date.now(), ACTIVE_USAGE_STALE_AFTER_MS)).toBe(true);
  });

  it('only ranks non-active candidates with fresh usage under the threshold', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const ranked = getRankedSwitchCandidates([
      createAccount({
        name: 'active',
        isActive: true,
        usage: {
          primaryWindow: { usedPercent: 10 },
          secondaryWindow: { usedPercent: 10, resetsAt: 1_700_100_000 },
        },
        lastUsageUpdate: 1_700_000_000_000 - 30_000,
      }),
      createAccount({
        name: 'stale',
        usage: {
          primaryWindow: { usedPercent: 10 },
          secondaryWindow: { usedPercent: 10, resetsAt: 1_700_100_000 },
        },
        lastUsageUpdate: 1_700_000_000_000 - (91 * 60 * 1000),
      }),
      createAccount({
        name: 'full',
        usage: {
          primaryWindow: { usedPercent: 99 },
          secondaryWindow: { usedPercent: 10, resetsAt: 1_700_100_000 },
        },
        lastUsageUpdate: 1_700_000_000_000 - 30_000,
      }),
      createAccount({
        name: 'ready',
        usage: {
          primaryWindow: { usedPercent: 20 },
          secondaryWindow: { usedPercent: 15, resetsAt: 1_700_100_000 },
        },
        lastUsageUpdate: 1_700_000_000_000 - 30_000,
      }),
    ]);

    expect(ranked.map((account) => account.name)).toEqual(['ready']);
  });

  it('keeps only the first active account flagged as active', () => {
    const normalized = normalizeSingleActiveAccount([
      createAccount({ name: 'first', isActive: true }),
      createAccount({ name: 'second', isActive: true, filePath: 'second.json' }),
      createAccount({ name: 'third', isActive: false, filePath: 'third.json' }),
    ]);

    expect(normalized.map((account) => account.isActive)).toEqual([true, false, false]);
  });
});
