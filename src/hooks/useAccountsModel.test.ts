import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountInfo } from '../types';
import { normalizePoolMetadata, sortAccountsByWeeklyRule } from './useAccountsModel';

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
});
