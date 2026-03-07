import { beforeEach, describe, expect, it } from 'vitest';
import { appendSyncHistory, getEnabledSyncItems, loadSyncHistory } from './syncHistory';
import type { SyncPreview, SyncResult, SyncSettings } from '../types';

const syncSettings: SyncSettings = {
  syncAccounts: true,
  syncPrompts: true,
  syncSkills: false,
  syncAgentsMd: true,
  syncConfigToml: false,
};

const result: SyncResult = {
  uploaded: ['one'],
  downloaded: ['two'],
  errors: [],
};

const preview: SyncPreview = {
  items: [],
  uploadCount: 1,
  downloadCount: 1,
  conflictCount: 2,
};

describe('syncHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('derives enabled sync items in stable order', () => {
    expect(getEnabledSyncItems(syncSettings)).toEqual(['Accounts', 'Prompts', 'AGENTS.MD']);
  });

  it('appends latest sync entry to history storage', () => {
    const entries = appendSyncHistory('upload', syncSettings, result, preview);

    expect(entries).toHaveLength(1);
    expect(entries[0].direction).toBe('upload');
    expect(entries[0].conflictCount).toBe(2);
    expect(loadSyncHistory()[0].uploadedCount).toBe(1);
  });
});
