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
    primaryWindow: value.primaryWindow ? {
      usedPercent: normalizeNumber(value.primaryWindow.usedPercent) ?? 0,
      windowMinutes: normalizeNumber(value.primaryWindow.windowMinutes),
      resetsAt: normalizeNumber(value.primaryWindow.resetsAt),
    } : undefined,
    secondaryWindow: value.secondaryWindow ? {
      usedPercent: normalizeNumber(value.secondaryWindow.usedPercent) ?? 0,
      windowMinutes: normalizeNumber(value.secondaryWindow.windowMinutes),
      resetsAt: normalizeNumber(value.secondaryWindow.resetsAt),
    } : undefined,
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
