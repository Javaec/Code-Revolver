import {
  AccountInfo,
  AccountPoolMetadata,
  AppSettings,
  DEFAULT_ACCOUNT_POOL_METADATA,
  DEFAULT_GATEWAY_SETTINGS,
  DEFAULT_SETTINGS,
  GatewaySettings,
} from '../types';

export function normalizePoolMetadata(metadata?: unknown): AccountPoolMetadata {
  const source = typeof metadata === 'object' && metadata !== null
    ? metadata as Partial<AccountPoolMetadata>
    : {};
  const numericPriority = Number(
    typeof metadata === 'number'
      ? metadata
      : source.priority ?? DEFAULT_ACCOUNT_POOL_METADATA.priority,
  );
  const safePriority = Number.isFinite(numericPriority)
    ? Math.max(1, Math.min(10, Math.round(numericPriority)))
    : DEFAULT_ACCOUNT_POOL_METADATA.priority;

  return {
    priority: safePriority,
  };
}

export function normalizeGatewaySettings(gateway?: Partial<GatewaySettings>): GatewaySettings {
  const keepAliveIntervalSec = Number(gateway?.keepAliveIntervalSec ?? DEFAULT_GATEWAY_SETTINGS.keepAliveIntervalSec);
  const safeKeepAlive = Number.isFinite(keepAliveIntervalSec)
    ? Math.max(15, Math.min(3600, Math.round(keepAliveIntervalSec)))
    : DEFAULT_GATEWAY_SETTINGS.keepAliveIntervalSec;

  return {
    ...DEFAULT_GATEWAY_SETTINGS,
    ...gateway,
    platformKey: gateway?.platformKey ?? '',
    hasStoredPlatformKey: gateway?.hasStoredPlatformKey ?? Boolean(gateway?.platformKey),
    endpoint: gateway?.endpoint?.trim() || DEFAULT_GATEWAY_SETTINGS.endpoint,
    oauthCallbackUrl: gateway?.oauthCallbackUrl?.trim() || DEFAULT_GATEWAY_SETTINGS.oauthCallbackUrl,
    keepAliveIntervalSec: safeKeepAlive,
    lastHealthCheckAt: gateway?.lastHealthCheckAt,
    lastHealthLatencyMs: gateway?.lastHealthLatencyMs,
    lastStatusCode: gateway?.lastStatusCode,
    lastHealthError: gateway?.lastHealthError ?? '',
  };
}

export function normalizeSettings(candidate?: Partial<AppSettings>): AppSettings {
    const normalizedPool: Record<string, AccountPoolMetadata> = {};
    const poolSource = candidate?.accountPool || {};
  Object.entries(poolSource).forEach(([key, value]) => {
    normalizedPool[key] = normalizePoolMetadata(value);
  });

  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    settingsVersion: DEFAULT_SETTINGS.settingsVersion,
    accountPool: normalizedPool,
    gateway: normalizeGatewaySettings(candidate?.gateway),
    webdav: {
      ...DEFAULT_SETTINGS.webdav!,
      ...candidate?.webdav,
      password: candidate?.webdav?.password ?? '',
      hasStoredPassword: candidate?.webdav?.hasStoredPassword ?? Boolean(candidate?.webdav?.password),
    },
    sync: { ...DEFAULT_SETTINGS.sync!, ...candidate?.sync },
  };
}

export function calculateSwitchScore(account: AccountInfo): number {
  const priority = account.pool?.priority ?? DEFAULT_ACCOUNT_POOL_METADATA.priority;
  const primaryUsage = account.usage?.primaryWindow?.usedPercent ?? 100;
  const weeklyUsage = account.usage?.secondaryWindow?.usedPercent ?? 100;
  const usageScore = 200 - primaryUsage - weeklyUsage;
  const weeklyResetAt = account.usage?.secondaryWindow?.resetsAt ?? Number.MAX_SAFE_INTEGER;
  const resetPenalty = weeklyResetAt === Number.MAX_SAFE_INTEGER
    ? 10_000
    : Math.max(0, weeklyResetAt - Date.now()) / (1000 * 60 * 60);

  return priority * 1000 + usageScore * 5 - resetPenalty;
}

function getWeeklyUsagePercent(account: AccountInfo): number {
  return account.usage?.secondaryWindow?.usedPercent ?? 100;
}

function getWeeklyResetEtaMs(account: AccountInfo, nowMs: number): number {
  const resetsAt = account.usage?.secondaryWindow?.resetsAt;
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const resetAtMs = resetsAt < 10_000_000_000 ? resetsAt * 1000 : resetsAt;
  return Math.max(0, resetAtMs - nowMs);
}

function getWeeklyGroupOrder(account: AccountInfo): number {
  const weekly = getWeeklyUsagePercent(account);
  return weekly > 90 ? 1 : 0;
}

function compareAccountsByWeeklyReset(a: AccountInfo, b: AccountInfo, nowMs: number): number {
  const groupDiff = getWeeklyGroupOrder(a) - getWeeklyGroupOrder(b);
  if (groupDiff !== 0) return groupDiff;

  const groupOrder = getWeeklyGroupOrder(a);
  if (groupOrder === 0) {
    const weeklyDiff = getWeeklyUsagePercent(a) - getWeeklyUsagePercent(b);
    if (weeklyDiff !== 0) return weeklyDiff;
  } else {
    const etaDiff = getWeeklyResetEtaMs(a, nowMs) - getWeeklyResetEtaMs(b, nowMs);
    if (etaDiff !== 0) return etaDiff;
  }

  return a.name.localeCompare(b.name, 'en-US');
}

export function sortAccountsByWeeklyRule(accounts: AccountInfo[]): AccountInfo[] {
  const nowMs = Date.now();
  return [...accounts].sort((a, b) => compareAccountsByWeeklyReset(a, b, nowMs));
}
