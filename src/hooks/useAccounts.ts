import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    AccountInfo,
    UsageInfo,
    AppSettings,
    DEFAULT_SETTINGS,
    MutationResult,
    AccountPoolMetadata,
} from '../types';
import {
    calculateSwitchScore,
    normalizePoolMetadata,
    normalizeSettings,
    sortAccountsByWeeklyRule,
} from './useAccountsModel';
import { useIntervalTask } from './useIntervalTask';
import { commands } from '../lib/commands';

const SETTINGS_STORAGE_KEY = 'code_revolver_settings';
const USAGE_CACHE_KEY = 'code_revolver_usage_cache';

type UsageCacheEntry = {
    usage: UsageInfo;
    cachedAt: number;
};

type AccountMutationKind = 'switch' | 'rename' | 'delete' | 'refresh-token';

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

function persistSettings(settings: AppSettings): void {
    const persistedSettings = {
        ...settings,
        gateway: {
            ...settings.gateway,
            platformKey: '',
            hasStoredPlatformKey: settings.gateway.hasStoredPlatformKey ?? Boolean(settings.gateway.platformKey),
        },
        webdav: settings.webdav ? {
            ...settings.webdav,
            password: '',
            hasStoredPassword: settings.webdav.hasStoredPassword ?? Boolean(settings.webdav.password),
        } : settings.webdav,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persistedSettings));
}

export function useAccounts() {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [accountsDir, setAccountsDirState] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [usageLoadingByPath, setUsageLoadingByPath] = useState<Record<string, boolean>>({});
    const [activeAccountMutation, setActiveAccountMutation] = useState<{ filePath: string; kind: AccountMutationKind } | null>(null);
    const refreshInFlightRef = useRef<Promise<void> | null>(null);
    const refreshQueuedRef = useRef(false);
    const refreshRunIdRef = useRef(0);
    const autoSwitchInFlightRef = useRef(false);
    const accountMutationInFlightRef = useRef(false);

    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!saved) return normalizeSettings(DEFAULT_SETTINGS);
            return normalizeSettings(JSON.parse(saved));
        } catch {
            return normalizeSettings(DEFAULT_SETTINGS);
        }
    });
    const settingsRef = useRef(settings);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        const hydrateWebDavPassword = async () => {
            const legacyPassword = settingsRef.current.webdav?.password?.trim();
            const legacyGatewayKey = settingsRef.current.gateway.platformKey?.trim();
            if (legacyPassword) {
                try {
                    await commands.setWebDavPassword(legacyPassword);
                } catch (error) {
                    console.error('Failed to migrate WebDAV password to secure storage:', error);
                }

                setSettings((prev) => {
                    const next = normalizeSettings({
                        ...prev,
                        webdav: {
                            ...(prev.webdav || DEFAULT_SETTINGS.webdav!),
                            password: legacyPassword,
                            hasStoredPassword: true,
                        },
                    });
                    persistSettings(next);
                    return next;
                });
            }

            try {
                const storedPassword = await commands.getWebDavPassword();
                const storedGatewayKey = await commands.getGatewayPlatformKey();
                setSettings((prev) => {
                    const next = normalizeSettings({
                        ...prev,
                        gateway: {
                            ...prev.gateway,
                            platformKey: storedGatewayKey ?? legacyGatewayKey ?? '',
                            hasStoredPlatformKey: Boolean(storedGatewayKey) || Boolean(legacyGatewayKey),
                        },
                        webdav: {
                            ...(prev.webdav || DEFAULT_SETTINGS.webdav!),
                            password: storedPassword ?? legacyPassword ?? '',
                            hasStoredPassword: Boolean(storedPassword) || Boolean(legacyPassword),
                        },
                    });
                    persistSettings(next);
                    return next;
                });
                if (legacyGatewayKey) {
                    await commands.setGatewayPlatformKey(legacyGatewayKey);
                }
            } catch (error) {
                console.error('Failed to hydrate secrets from secure storage:', error);
            }
        };

        void hydrateWebDavPassword();
    }, []);

    const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
        const nextPassword = newSettings.webdav && Object.prototype.hasOwnProperty.call(newSettings.webdav, 'password')
            ? newSettings.webdav.password ?? ''
            : undefined;
        const nextGatewayKey = newSettings.gateway && Object.prototype.hasOwnProperty.call(newSettings.gateway, 'platformKey')
            ? newSettings.gateway.platformKey ?? ''
            : undefined;

        if (nextPassword !== undefined) {
            void commands.setWebDavPassword(nextPassword).catch((error) => {
                console.error('Failed to persist WebDAV password in secure storage:', error);
            });
        }
        if (nextGatewayKey !== undefined) {
            void commands.setGatewayPlatformKey(nextGatewayKey).catch((error) => {
                console.error('Failed to persist gateway platform key in secure storage:', error);
            });
        }

        setSettings(prev => {
            const mergedPool = newSettings.accountPool
                ? { ...prev.accountPool, ...newSettings.accountPool }
                : prev.accountPool;
            const mergedGateway = newSettings.gateway
                ? {
                    ...prev.gateway,
                    ...newSettings.gateway,
                    hasStoredPlatformKey: nextGatewayKey !== undefined
                        ? nextGatewayKey.trim().length > 0
                        : newSettings.gateway.hasStoredPlatformKey ?? prev.gateway.hasStoredPlatformKey ?? false,
                }
                : prev.gateway;
            const mergedWebDav = newSettings.webdav
                ? {
                    ...(prev.webdav || DEFAULT_SETTINGS.webdav!),
                    ...newSettings.webdav,
                    hasStoredPassword: nextPassword !== undefined
                        ? nextPassword.trim().length > 0
                        : newSettings.webdav.hasStoredPassword ?? prev.webdav?.hasStoredPassword ?? false,
                }
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

            persistSettings(next);
            return next;
        });
    }, []);

    const fetchUsage = useCallback(async (filePath: string): Promise<UsageInfo> => {
        return await commands.fetchUsage(filePath);
    }, []);

    const withAccountMutationLock = useCallback(async <T,>(
        filePath: string,
        kind: AccountMutationKind,
        task: () => Promise<T>,
    ): Promise<T> => {
        if (accountMutationInFlightRef.current) {
            throw new Error('Another account action is already running');
        }

        accountMutationInFlightRef.current = true;
        setActiveAccountMutation({ filePath, kind });

        try {
            return await task();
        } finally {
            accountMutationInFlightRef.current = false;
            setActiveAccountMutation(null);
        }
    }, []);

    const refresh = useCallback(async () => {
        if (refreshInFlightRef.current) {
            refreshQueuedRef.current = true;
            return refreshInFlightRef.current;
        }

        const refreshPromise = (async () => {
            const refreshRunId = ++refreshRunIdRef.current;
            setLoading(true);

            try {
                const result = await commands.scanAccounts();
                const usageCache = loadUsageCache();
                const accountPool = settingsRef.current.accountPool;
                const usageUpdatesByPath: Record<string, {
                    usage?: UsageInfo;
                    cachedAt: number;
                    isTokenExpired: boolean;
                }> = {};
                let usageCacheChanged = false;

                setAccountsDirState(result.accountsDir);

                const migratedPoolEntries: Record<string, AccountPoolMetadata> = {};
                const baseAccounts = result.accounts.map((account) => {
                    const rawPoolMetadata = accountPool[account.id] || accountPool[account.filePath];
                    const pool = normalizePoolMetadata(rawPoolMetadata);

                    if (!accountPool[account.id] && accountPool[account.filePath]) {
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

                if (Object.keys(migratedPoolEntries).length > 0) {
                    updateSettings({ accountPool: migratedPoolEntries });
                }
                setAccounts(sortAccountsByWeeklyRule(baseAccounts));

                const loadingMap = Object.fromEntries(
                    baseAccounts.map((account) => [account.filePath, true]),
                ) as Record<string, boolean>;
                setUsageLoadingByPath(loadingMap);

                await Promise.allSettled(baseAccounts.map(async (account) => {
                    try {
                        const usage = await fetchUsage(account.filePath);
                        const cachedAt = Date.now();
                        usageCache[account.filePath] = {
                            usage,
                            cachedAt,
                        };
                        usageCacheChanged = true;
                        usageUpdatesByPath[account.filePath] = {
                            usage,
                            cachedAt,
                            isTokenExpired: false,
                        };
                    } catch (error: unknown) {
                        const errStr = String(error);
                        const isExpired = errStr.includes('401')
                            || errStr.includes('403')
                            || errStr.includes('Status: 401')
                            || errStr.includes('Status: 403');
                        const cached = usageCache[account.filePath];
                        usageUpdatesByPath[account.filePath] = {
                            usage: cached?.usage,
                            cachedAt: cached?.cachedAt ?? Date.now(),
                            isTokenExpired: isExpired,
                        };
                    } finally {
                        setUsageLoadingByPath((prev) => ({ ...prev, [account.filePath]: false }));
                    }
                }));

                if (usageCacheChanged) {
                    saveUsageCache(usageCache);
                }

                const nextAccounts = baseAccounts.map((account) => {
                    const usageUpdate = usageUpdatesByPath[account.filePath];
                    if (!usageUpdate) return account;
                    return {
                        ...account,
                        usage: usageUpdate.usage,
                        lastUsageUpdate: usageUpdate.cachedAt,
                        isTokenExpired: usageUpdate.isTokenExpired,
                    };
                });
                setAccounts(sortAccountsByWeeklyRule(nextAccounts));
            } catch (error) {
                console.error('Failed to scan accounts:', error);
            } finally {
                if (refreshRunId === refreshRunIdRef.current) {
                    setLoading(false);
                }
                refreshInFlightRef.current = null;

                if (refreshQueuedRef.current) {
                    refreshQueuedRef.current = false;
                    void refresh();
                }
            }
        })();

        refreshInFlightRef.current = refreshPromise;
        return refreshPromise;
    }, [fetchUsage, updateSettings]);

    const switchAccount = useCallback(async (filePath: string): Promise<MutationResult> => {
        try {
            await withAccountMutationLock(filePath, 'switch', async () => {
                await commands.switchAccount(filePath);

                // Optimistic update: mark new account active locally to avoid waiting for full refresh
                setAccounts(prev => prev.map(acc => {
                    if (acc.filePath === filePath) return { ...acc, isActive: true };
                    if (acc.isActive) return { ...acc, isActive: false };
                    return acc;
                }));

                await refresh();
            });
            return { success: true, message: 'Account switched' };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh, withAccountMutationLock]);

    const checkAutoSwitch = useCallback(async (currentAccounts: AccountInfo[]) => {
        if (!settings.enableAutoSwitch) return;
        if (autoSwitchInFlightRef.current) return;

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
            autoSwitchInFlightRef.current = true;
            try {
                await switchAccount(bestAccount.filePath);
            } finally {
                autoSwitchInFlightRef.current = false;
            }
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
                await commands.importDefaultAccount();
            } catch (e) {
                console.error('Failed to import default account:', e);
            }
            await refresh();
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useIntervalTask(settings.autoCheck, settings.checkInterval * 60 * 1000, () => {
        void refresh();
    });

    useEffect(() => {
        if (!settings.enableAutoSwitch) return;
        if (accounts.length === 0) return;
        if (loading) return;
        void checkAutoSwitch(accounts);
    }, [accounts, loading, settings.enableAutoSwitch, checkAutoSwitch]);

    const renameAccount = useCallback(async (oldPath: string, newName: string): Promise<MutationResult> => {
        // Find the account ID first to ensure we update the right one reliably
        const targetAccount = accounts.find(a => a.filePath === oldPath);
        const targetId = targetAccount?.id;

        try {
            await withAccountMutationLock(oldPath, 'rename', async () => {
                if (targetId) {
                    setAccounts(prevAccounts => prevAccounts.map(acc => (
                        acc.id === targetId ? { ...acc, name: newName } : acc
                    )));
                } else {
                    setAccounts(prevAccounts => prevAccounts.map(acc => (
                        acc.filePath === oldPath ? { ...acc, name: newName } : acc
                    )));
                }

                await commands.renameAccount(oldPath, newName);
                await new Promise(resolve => setTimeout(resolve, 500));
                await refresh();
            });
            return { success: true };
        } catch (error: unknown) {
            console.error("Rename failed:", error);
            await refresh(); // Force sync
            return { success: false, message: String(error) };
        }
    }, [accounts, refresh, withAccountMutationLock]);

    const setAccountsDir = useCallback(async (path: string): Promise<MutationResult> => {
        try {
            await commands.setAccountsDir(path);
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh]);

    const addAccount = useCallback(async (name: string, content: string): Promise<MutationResult> => {
        try {
            await commands.addAccount(name, content);
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
            await withAccountMutationLock(filePath, 'delete', async () => {
                await commands.deleteAccount(filePath);
                await new Promise(resolve => setTimeout(resolve, 500));
                await refresh();
            });
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh, withAccountMutationLock]);

    const refreshAccountToken = useCallback(async (filePath: string): Promise<MutationResult> => {
        try {
            const message = await withAccountMutationLock(filePath, 'refresh-token', async () => {
                const result = await commands.refreshAccountToken(filePath);
                await refresh();
                return result;
            });
            return { success: true, message };
        } catch (error: unknown) {
            return { success: false, message: String(error) };
        }
    }, [refresh, withAccountMutationLock]);

    const getAccountsDir = useCallback(async () => {
        try {
            return await commands.getAccountsDirPath();
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
        activeAccountMutation,
        settings,
        updateSettings,
        refresh,
        switchAccount,
        refreshAccountToken,
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
