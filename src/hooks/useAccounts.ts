import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    AccountInfo,
    ScanResult,
    UsageInfo,
    AppSettings,
    DEFAULT_SETTINGS,
    MutationResult,
    AccountPoolMetadata,
    DEFAULT_ACCOUNT_POOL_METADATA,
    GatewaySettings,
    DEFAULT_GATEWAY_SETTINGS,
} from '../types';
import { invoke } from '@tauri-apps/api/core';

const SETTINGS_STORAGE_KEY = 'code_revolver_settings';
const USAGE_CACHE_KEY = 'code_revolver_usage_cache';

type UsageCacheEntry = {
    usage: UsageInfo;
    cachedAt: number;
};

function loadUsageCache(): Record<string, UsageCacheEntry> {
    try {
        const raw = localStorage.getItem(USAGE_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, UsageCacheEntry>;
    } catch {
        return {};
    }
}

function saveUsageCache(cache: Record<string, UsageCacheEntry>): void {
    localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(cache));
}

function normalizePoolMetadata(metadata?: unknown): AccountPoolMetadata {
    const source = typeof metadata === 'object' && metadata !== null
        ? metadata as Partial<AccountPoolMetadata>
        : {};
    const numericPriority = Number(
        typeof metadata === 'number'
            ? metadata
            : source.priority ?? DEFAULT_ACCOUNT_POOL_METADATA.priority
    );
    const safePriority = Number.isFinite(numericPriority)
        ? Math.max(1, Math.min(10, Math.round(numericPriority)))
        : DEFAULT_ACCOUNT_POOL_METADATA.priority;

    return {
        priority: safePriority,
    };
}

function normalizeGatewaySettings(gateway?: Partial<GatewaySettings>): GatewaySettings {
    const keepAliveIntervalSec = Number(gateway?.keepAliveIntervalSec ?? DEFAULT_GATEWAY_SETTINGS.keepAliveIntervalSec);
    const safeKeepAlive = Number.isFinite(keepAliveIntervalSec)
        ? Math.max(15, Math.min(3600, Math.round(keepAliveIntervalSec)))
        : DEFAULT_GATEWAY_SETTINGS.keepAliveIntervalSec;

    return {
        ...DEFAULT_GATEWAY_SETTINGS,
        ...gateway,
        endpoint: gateway?.endpoint?.trim() || DEFAULT_GATEWAY_SETTINGS.endpoint,
        oauthCallbackUrl: gateway?.oauthCallbackUrl?.trim() || DEFAULT_GATEWAY_SETTINGS.oauthCallbackUrl,
        keepAliveIntervalSec: safeKeepAlive,
    };
}

function normalizeSettings(candidate?: Partial<AppSettings>): AppSettings {
    const normalizedPool: Record<string, AccountPoolMetadata> = {};
    const poolSource = candidate?.accountPool || {};
    Object.entries(poolSource).forEach(([key, value]) => {
        normalizedPool[key] = normalizePoolMetadata(value);
    });

    return {
        ...DEFAULT_SETTINGS,
        ...candidate,
        accountPool: normalizedPool,
        gateway: normalizeGatewaySettings(candidate?.gateway),
        webdav: { ...DEFAULT_SETTINGS.webdav!, ...candidate?.webdav },
        sync: { ...DEFAULT_SETTINGS.sync!, ...candidate?.sync },
    };
}

function calculateSwitchScore(account: AccountInfo): number {
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

    // Backend provides reset timestamp in Unix seconds in most cases.
    const resetAtMs = resetsAt < 10_000_000_000 ? resetsAt * 1000 : resetsAt;
    return Math.max(0, resetAtMs - nowMs);
}

function getWeeklyResetRemainingDays(account: AccountInfo, nowMs: number): number {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const etaMs = getWeeklyResetEtaMs(account, nowMs);
    if (!Number.isFinite(etaMs)) {
        return Number.MAX_SAFE_INTEGER;
    }

    return Math.floor(etaMs / DAY_MS);
}

function getWeeklyGroupOrder(account: AccountInfo): number {
    const weekly = getWeeklyUsagePercent(account);
    return weekly > 90 ? 1 : 0;
}

function compareAccountsByWeeklyReset(a: AccountInfo, b: AccountInfo, nowMs: number): number {
    const groupDiff = getWeeklyGroupOrder(a) - getWeeklyGroupOrder(b);
    if (groupDiff !== 0) return groupDiff;

    const dayDiff = getWeeklyResetRemainingDays(a, nowMs) - getWeeklyResetRemainingDays(b, nowMs);
    if (dayDiff !== 0) return dayDiff;

    return a.name.localeCompare(b.name, 'en-US');
}

export function useAccounts() {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [accountsDir, setAccountsDirState] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [usageLoadingByPath, setUsageLoadingByPath] = useState<Record<string, boolean>>({});

    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!saved) return normalizeSettings(DEFAULT_SETTINGS);
            return normalizeSettings(JSON.parse(saved));
        } catch {
            return normalizeSettings(DEFAULT_SETTINGS);
        }
    });

    const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
        setSettings(prev => {
            const mergedPool = newSettings.accountPool
                ? { ...prev.accountPool, ...newSettings.accountPool }
                : prev.accountPool;
            const mergedGateway = newSettings.gateway
                ? { ...prev.gateway, ...newSettings.gateway }
                : prev.gateway;
            const mergedWebDav = newSettings.webdav
                ? { ...(prev.webdav || DEFAULT_SETTINGS.webdav!), ...newSettings.webdav }
                : prev.webdav;
            const mergedSync = newSettings.sync
                ? { ...(prev.sync || DEFAULT_SETTINGS.sync!), ...newSettings.sync }
                : prev.sync;

            const next = normalizeSettings({
                ...prev,
                ...newSettings,
                accountPool: mergedPool,
                gateway: mergedGateway,
                webdav: mergedWebDav,
                sync: mergedSync,
            });

            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const fetchUsage = useCallback(async (filePath: string): Promise<UsageInfo> => {
        return await invoke<UsageInfo>('fetch_usage', { filePath });
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await invoke<ScanResult>('scan_accounts');

            setAccountsDirState(result.accountsDir);
            const usageCache = loadUsageCache();

            const migratedPoolEntries: Record<string, AccountPoolMetadata> = {};
            const baseAccounts = result.accounts.map((account) => {
                const rawPoolMetadata = settings.accountPool[account.id] || settings.accountPool[account.filePath];
                const pool = normalizePoolMetadata(rawPoolMetadata);

                if (!settings.accountPool[account.id] && settings.accountPool[account.filePath]) {
                    migratedPoolEntries[account.id] = pool;
                }

                const cached = usageCache[account.filePath];
                return {
                    ...account,
                    usage: cached?.usage,
                    lastUsageUpdate: cached?.cachedAt ?? Date.now(),
                    isTokenExpired: false,
                    pool,
                };
            });

            const hasPoolMigration = Object.keys(migratedPoolEntries).length > 0;
            if (hasPoolMigration) {
                updateSettings({ accountPool: migratedPoolEntries });
            }
            saveUsageCache(usageCache);

            const nowMs = Date.now();
            baseAccounts.sort((a, b) => compareAccountsByWeeklyReset(a, b, nowMs));
            setAccounts(baseAccounts);

            const loadingMap: Record<string, boolean> = {};
            baseAccounts.forEach(acc => {
                loadingMap[acc.filePath] = true;
            });
            setUsageLoadingByPath(loadingMap);

            baseAccounts.forEach(acc => {
                fetchUsage(acc.filePath)
                    .then((usage) => {
                        usageCache[acc.filePath] = {
                            usage,
                            cachedAt: Date.now(),
                        };
                        saveUsageCache(usageCache);
                        setAccounts(prev => {
                            const next = prev.map(item => (
                                item.filePath === acc.filePath
                                    ? { ...item, usage, lastUsageUpdate: Date.now(), isTokenExpired: false }
                                    : item
                            ));
                            const now = Date.now();
                            next.sort((a, b) => compareAccountsByWeeklyReset(a, b, now));
                            return next;
                        });
                    })
                    .catch((error: unknown) => {
                        const errStr = String(error);
                        const isExpired = errStr.includes('401') || errStr.includes('403') || errStr.includes('Status: 401') || errStr.includes('Status: 403');
                        const cached = usageCache[acc.filePath];
                        setAccounts(prev => {
                            const next = prev.map(item => (
                                item.filePath === acc.filePath
                                    ? { ...item, usage: cached?.usage, lastUsageUpdate: cached?.cachedAt ?? Date.now(), isTokenExpired: isExpired }
                                    : item
                            ));
                            const now = Date.now();
                            next.sort((a, b) => compareAccountsByWeeklyReset(a, b, now));
                            return next;
                        });
                    })
                    .finally(() => {
                        setUsageLoadingByPath(prev => ({ ...prev, [acc.filePath]: false }));
                    });
            });

        } catch (error) {
            console.error('Failed to scan accounts:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchUsage, settings.accountPool, updateSettings]);

    const switchAccount = useCallback(async (filePath: string): Promise<MutationResult> => {
        try {
            await invoke('switch_account', { filePath });

            // Optimistic update: mark new account active locally to avoid waiting for full refresh
            setAccounts(prev => prev.map(acc => {
                if (acc.filePath === filePath) return { ...acc, isActive: true };
                if (acc.isActive) return { ...acc, isActive: false };
                return acc;
            }));

            await refresh(); // Refresh status
            return { success: true, message: 'Account switched' };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh]);

    const checkAutoSwitch = useCallback(async (currentAccounts: AccountInfo[]) => {
        if (!settings.enableAutoSwitch) return;

        const activeAccount = currentAccounts.find(a => a.isActive);
        if (!activeAccount) return;

        const threshold = Math.max(1, Math.min(50, settings.autoSwitchThreshold || DEFAULT_SETTINGS.autoSwitchThreshold));
        const usedPercentLimit = 100 - threshold;

        // Determine if the current account needs to be switched
        const isExpired = activeAccount.isTokenExpired;
        const isPrimaryFull = (activeAccount.usage?.primaryWindow?.usedPercent || 0) >= usedPercentLimit;
        const isSecondaryFull = (activeAccount.usage?.secondaryWindow?.usedPercent || 0) >= usedPercentLimit;

        if (isExpired || isPrimaryFull || isSecondaryFull) {
            // Filter candidate accounts
            const candidates = currentAccounts.filter(acc => {
                if (acc.isActive) return false; // Exclude self
                if (acc.isTokenExpired) return false; // Exclude expired
                if ((acc.usage?.primaryWindow?.usedPercent || 0) >= usedPercentLimit) return false; // Exclude full
                if ((acc.usage?.secondaryWindow?.usedPercent || 0) >= usedPercentLimit) return false; // Exclude full
                return true;
            });

            if (candidates.length === 0) return;

            // Ranking algorithm: prioritize metadata priority, then lower usage, then faster resets
            candidates.sort((a, b) => calculateSwitchScore(b) - calculateSwitchScore(a));

            const bestAccount = candidates[0];
            // Perform switch
            await switchAccount(bestAccount.filePath);
        }
    }, [settings.enableAutoSwitch, settings.autoSwitchThreshold, switchAccount]);

    // Calculate Best Candidate account
    const bestCandidateFilePath = useMemo(() => {
        const candidates = accounts.filter(acc => {
            if (acc.isTokenExpired) return false;
            // Strict usage check. If account is > 99%, we probably shouldn't count it as "Best" available.
            if ((acc.usage?.primaryWindow?.usedPercent || 0) >= 99) return false;
            if ((acc.usage?.secondaryWindow?.usedPercent || 0) >= 99) return false;
            return true;
        });

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => calculateSwitchScore(b) - calculateSwitchScore(a));

        return candidates[0].filePath;
    }, [accounts]);

    const rankedCandidates = useMemo(() => {
        const candidates = accounts.filter(acc => {
            if (acc.isTokenExpired) return false;
            if (acc.isActive) return false;
            if ((acc.usage?.primaryWindow?.usedPercent || 0) >= 99) return false;
            if ((acc.usage?.secondaryWindow?.usedPercent || 0) >= 99) return false;
            return true;
        });

        return candidates
            .sort((a, b) => calculateSwitchScore(b) - calculateSwitchScore(a))
            .slice(0, 4);
    }, [accounts]);

    useEffect(() => {
        const init = async () => {
            try {
                await invoke('import_default_account');
            } catch (e) {
                console.error('Failed to import default account:', e);
            }
            await refresh();
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!settings.autoCheck || settings.checkInterval <= 0) return;
        const intervalId = setInterval(() => {
            refresh();
        }, settings.checkInterval * 60 * 1000);
        return () => clearInterval(intervalId);
    }, [settings.autoCheck, settings.checkInterval, refresh]);

    useEffect(() => {
        if (!settings.enableAutoSwitch) return;
        if (accounts.length === 0) return;
        checkAutoSwitch(accounts);
    }, [accounts, settings.enableAutoSwitch, checkAutoSwitch]);

    const renameAccount = useCallback(async (oldPath: string, newName: string): Promise<MutationResult> => {
        // Find the account ID first to ensure we update the right one reliably
        const targetAccount = accounts.find(a => a.filePath === oldPath);
        const targetId = targetAccount?.id;

        if (targetId) {
            // 1. Optimistic Update (Immediate UI Feedback via ID)
            setAccounts(prevAccounts => prevAccounts.map(acc => {
                if (acc.id === targetId) {
                    return { ...acc, name: newName };
                }
                return acc;
            }));
        } else {
            // Fallback to path if ID not found (shouldn't happen)
            setAccounts(prevAccounts => prevAccounts.map(acc => {
                if (acc.filePath === oldPath) {
                    return { ...acc, name: newName };
                }
                return acc;
            }));
        }

        try {
            await invoke('rename_account', { oldPath, newName });
            // Add a delay to ensure FS operation is seen by scan
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            return { success: true };
        } catch (error: unknown) {
            console.error("Rename failed:", error);
            await refresh(); // Force sync
            return { success: false, message: String(error) };
        }
    }, [accounts, refresh]); // Added accounts dependency

    const setAccountsDir = useCallback(async (path: string): Promise<MutationResult> => {
        try {
            await invoke('set_accounts_dir', { path });
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh]);

    const addAccount = useCallback(async (name: string, content: string): Promise<MutationResult> => {
        try {
            await invoke('add_account', { name, content });
            // Add a small delay to ensure FS is flushed before scanning
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh]);

    const deleteAccount = useCallback(async (filePath: string): Promise<MutationResult> => {
        try {
            await invoke('delete_account', { filePath });
            // Add a small delay
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh]);

    const getAccountsDir = useCallback(async () => {
        try {
            return await invoke<string>('get_accounts_dir_path');
        } catch {
            return accountsDir;
        }
    }, [accountsDir]);

    const updateAccountPoolMetadata = useCallback((accountId: string, metadata: Partial<AccountPoolMetadata>): MutationResult => {
        const normalized = normalizePoolMetadata(metadata);
        updateSettings({
            accountPool: {
                [accountId]: normalized,
            },
        });

        setAccounts(prevAccounts => prevAccounts.map(acc => (
            acc.id === accountId ? { ...acc, pool: normalized } : acc
        )));

        return { success: true };
    }, [updateSettings]);

    return {
        accounts,
        accountsDir,
        loading,
        usageLoadingByPath,
        settings,
        updateSettings,
        refresh,
        switchAccount,
        renameAccount,
        setAccountsDir,
        addAccount,
        deleteAccount,
        getAccountsDir,
        bestCandidateFilePath,
        rankedCandidates,
        updateAccountPoolMetadata,
    };
}
