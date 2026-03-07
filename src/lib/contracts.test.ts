import { describe, expect, it } from 'vitest';
import { normalizeBackendAppConfig, normalizeSyncPreview, normalizeSyncResult, normalizeUsageInfo } from './contracts';

describe('contracts', () => {
  it('normalizes backend app config', () => {
    expect(normalizeBackendAppConfig({
      version: 2 as number,
      accountsDir: 'E:/accounts',
      debugLogging: true,
    })).toEqual({
      version: 2,
      accountsDir: 'E:/accounts',
      debugLogging: true,
    });
  });

  it('normalizes usage payload numbers', () => {
    expect(normalizeUsageInfo({
      primaryWindow: { usedPercent: Number('12.5'), resetsAt: Number('123'), windowMinutes: Number('60') },
    })).toEqual({
      primaryWindow: { usedPercent: 12.5, resetsAt: 123, windowMinutes: 60 },
      secondaryWindow: undefined,
      planType: undefined,
    });
  });

  it('normalizes sync preview and result collections', () => {
    expect(normalizeSyncPreview({
      items: [{ name: 'a', type: 'account', action: 'upload', localTime: 1, remoteTime: 2 }],
      uploadCount: 1,
      downloadCount: 0,
      conflictCount: 0,
    }).items[0].name).toBe('a');

    expect(normalizeSyncResult({
      uploaded: ['a'],
      downloaded: ['b'],
      errors: ['c'],
    })).toEqual({
      uploaded: ['a'],
      downloaded: ['b'],
      errors: ['c'],
    });
  });
});
