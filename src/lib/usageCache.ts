import { UsageInfo } from '../types';

const USAGE_CACHE_KEY = 'code_revolver_usage_cache';

export type UsageCacheEntry = {
  usage: UsageInfo;
  cachedAt: number;
};

export function loadUsageCache(): Record<string, UsageCacheEntry> {
  try {
    const raw = localStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, UsageCacheEntry>;
  } catch {
    return {};
  }
}

export function saveUsageCache(cache: Record<string, UsageCacheEntry>): void {
  localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(cache));
}
