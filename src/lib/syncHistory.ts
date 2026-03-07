import { SyncPreview, SyncResult, SyncSettings } from '../types';

const SYNC_HISTORY_STORAGE_KEY = 'code_revolver_sync_history';

export interface SyncHistoryEntry {
  id: number;
  happenedAt: number;
  direction: 'upload' | 'download';
  syncItems: string[];
  uploadedCount: number;
  downloadedCount: number;
  errorCount: number;
  conflictCount: number;
}

export function loadSyncHistory(): SyncHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncHistory(entries: SyncHistoryEntry[]): void {
  localStorage.setItem(SYNC_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 12)));
}

export function getEnabledSyncItems(syncSettings: SyncSettings): string[] {
  const items: string[] = [];
  if (syncSettings.syncAccounts) items.push('Accounts');
  if (syncSettings.syncPrompts) items.push('Prompts');
  if (syncSettings.syncSkills) items.push('Skills');
  if (syncSettings.syncAgentsMd) items.push('AGENTS.MD');
  if (syncSettings.syncConfigToml) items.push('config.toml');
  return items;
}

export function appendSyncHistory(
  direction: 'upload' | 'download',
  syncSettings: SyncSettings,
  result: SyncResult,
  preview: SyncPreview | null,
): SyncHistoryEntry[] {
  const nextEntry: SyncHistoryEntry = {
    id: Date.now(),
    happenedAt: Date.now(),
    direction,
    syncItems: getEnabledSyncItems(syncSettings),
    uploadedCount: result.uploaded.length,
    downloadedCount: result.downloaded.length,
    errorCount: result.errors.length,
    conflictCount: preview?.conflictCount ?? 0,
  };

  const next = [nextEntry, ...loadSyncHistory()].slice(0, 12);
  saveSyncHistory(next);
  return next;
}
