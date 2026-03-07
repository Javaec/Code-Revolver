import type {
  BackendAppConfig,
  SyncPreview,
  SyncPreviewItem,
  SyncResult,
  UsageInfo,
} from '../types';

function normalizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function clampPercent(value: unknown): number | undefined {
  const numeric = normalizeNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, numeric));
}

function normalizeUsageWindow(
  window: UsageInfo['primaryWindow'] | UsageInfo['secondaryWindow'] | undefined,
): UsageInfo['primaryWindow'] | undefined {
  if (!window) {
    return undefined;
  }

  const usedPercent = clampPercent(window.usedPercent);
  const windowMinutes = normalizeNumber(window.windowMinutes);
  const resetsAt = normalizeNumber(window.resetsAt);

  if (usedPercent === undefined && windowMinutes === undefined && resetsAt === undefined) {
    return undefined;
  }

  return {
    usedPercent: usedPercent ?? 0,
    windowMinutes,
    resetsAt,
  };
}

export function normalizeBackendAppConfig(value: BackendAppConfig): BackendAppConfig {
  return {
    version: normalizeNumber(value.version) ?? 1,
    accountsDir: typeof value.accountsDir === 'string' ? value.accountsDir : undefined,
    debugLogging: Boolean(value.debugLogging),
  };
}

export function normalizeUsageInfo(value: UsageInfo): UsageInfo {
  return {
    planType: typeof value.planType === 'string' ? value.planType : undefined,
    primaryWindow: normalizeUsageWindow(value.primaryWindow),
    secondaryWindow: normalizeUsageWindow(value.secondaryWindow),
  };
}

function normalizePreviewItem(item: SyncPreviewItem): SyncPreviewItem {
  return {
    name: String(item.name ?? ''),
    type: item.type,
    action: item.action,
    localTime: normalizeNumber(item.localTime),
    remoteTime: normalizeNumber(item.remoteTime),
  };
}

export function normalizeSyncPreview(value: SyncPreview): SyncPreview {
  return {
    items: Array.isArray(value.items) ? value.items.map(normalizePreviewItem) : [],
    uploadCount: normalizeNumber(value.uploadCount) ?? 0,
    downloadCount: normalizeNumber(value.downloadCount) ?? 0,
    conflictCount: normalizeNumber(value.conflictCount) ?? 0,
  };
}

export function normalizeSyncResult(value: SyncResult): SyncResult {
  return {
    uploaded: Array.isArray(value.uploaded) ? value.uploaded.map((entry) => String(entry)) : [],
    downloaded: Array.isArray(value.downloaded) ? value.downloaded.map((entry) => String(entry)) : [],
    errors: Array.isArray(value.errors) ? value.errors.map((entry) => String(entry)) : [],
  };
}
