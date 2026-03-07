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
    ACTIVE_USAGE_STALE_AFTER_MS,
    getRankedSwitchCandidates,
    isUsageAtOrAboveLimit,
    isUsageFresh,
    normalizePoolMetadata,
    normalizeSettings,
    sortAccountsByWeeklyRule,
} from './useAccountsModel';
import { useIntervalTask } from './useIntervalTask';
import { useAdaptivePoll } from './useAdaptivePoll';
import { commands } from '../lib/commands';
import { useNotifications } from '../lib/notificationState';
import { migrateLegacySecrets, loadStoredSettings, persistSettings } from '../lib/settingsStorage';
import { loadUsageCache, saveUsageCache, type UsageCacheEntry } from '../lib/usageCache';
import { toErrorMessage } from '../lib/errors';
import { mapWithConcurrency } from '../lib/asyncPool';

type AccountMutationKind = 'switch' | 'rename' | 'delete' | 'refresh-token';
type FailedMutation =
    | { kind: 'switch' | 'delete' | 'refresh-token'; filePath: string; message: string }
    | { kind: 'rename'; filePath: string; newName: string; message: string };

type UsageSnapshotUpdate = {
    usage?: UsageInfo;
    cachedAt?: number;
    isTokenExpired: boolean;
};

const USAGE_FETCH_CONCURRENCY = 4;
const ACTIVE_ACCOUNT_USAGE_POLL_MS = 20_000;
const ACTIVE_ACCOUNT_USAGE_MAX_BACKOFF_MS = 120_000;

export function useAccounts() {
    const { notifyError, notifyInfo } = useNotifications();
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [accountsDir, setAccountsDirState] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [usageLoadingByPath, setUsageLoadingByPath] = useState<Record<string, boolean>>({});
    const [activeAccountMutation, setActiveAccountMutation] = useState<{ filePath: string; kind: AccountMutationKind } | null>(null);
    const [lastFailedMutation, setLastFailedMutation] = useState<FailedMutation | null>(null);
    const refreshInFlightRef = useRef<Promise<void> | null>(null);
    const refreshQueuedRef = useRef(false);
    const refreshRunIdRef = useRef(0);
    const autoSwitchInFlightRef = useRef(false);
    const accountMutationInFlightRef = useRef(false);
    const usageCacheRef = useRef<Record<string, UsageCacheEntry>>(loadUsageCache());

    const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());
    const settingsRef = useRef(settings);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        const migrateSecrets = async () => {
            try {
                const next = await migrateLegacySecrets(settingsRef.current);
                setSettings(next);
                persistSettings(next);
            } catch (error) {
                notifyError(toErrorMessage(error), 'Secure Storage');
            }
        };

        void migrateSecrets();
    }, [notifyError]);

    const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
        const nextPassword = newSettings.webdav && Object.prototype.hasOwnProperty.call(newSettings.webdav, 'password')
            ? newSettings.webdav.password ?? ''
            : undefined;
        const nextGatewayKey = newSettings.gateway && Object.prototype.hasOwnProperty.call(newSettings.gateway, 'platformKey')
            ? newSettings.gateway.platformKey ?? ''
            : undefined;

        if (nextPassword !== undefined) {
            void commands.setWebDavPassword(nextPassword).catch((error) => {
                notifyError(toErrorMessage(error), 'Secure Storage');
            });
        }
        if (nextGatewayKey !== undefined) {
            void commands.setGatewayPlatformKey(nextGatewayKey).catch((error) => {
                notifyError(toErrorMessage(error), 'Secure Storage');
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
                    platformKey: '',
                    hasStoredPlatformKey: nextGatewayKey !== undefined
                        ? nextGatewayKey.trim().length > 0
                        : newSettings.gateway.hasStoredPlatformKey ?? prev.gateway.hasStoredPlatformKey ?? false,
                }
                : prev.gateway;
            const mergedWebDav = newSettings.webdav
                ? {
                    ...(prev.webdav || DEFAULT_SETTINGS.webdav!),
                    ...newSettings.webdav,
                    password: '',
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
    }, [notifyError]);

    const fetchUsage = useCallback(async (filePath: string): Promise<UsageInfo> => {
        return await commands.fetchUsage(filePath);
    }, []);

    const fetchActiveUsage = useCallback(async (): Promise<UsageInfo> => {
        return await commands.fetchActiveUsage();
    }, []);

    const fetchUsageForAccount = useCallback(async (account: AccountInfo): Promise<UsageInfo> => {
        if (!account.isActive) {
            return await fetchUsage(account.filePath);
        }

        try {
            return await fetchActiveUsage();
        } catch {
            return await fetchUsage(account.filePath);
        }
    }, [fetchActiveUsage, fetchUsage]);

    const applyUsageSnapshot = useCallback((
        filePath: string,
        update: UsageSnapshotUpdate,
        options?: { persistCache?: boolean },
    ) => {
        if (update.usage && typeof update.cachedAt === 'number') {
            usageCacheRef.current[filePath] = {
                usage: update.usage,
                cachedAt: update.cachedAt,
            };
            if (options?.persistCache !== false) {
                saveUsageCache(usageCacheRef.current);
            }
        }

        setAccounts((prevAccounts) => sortAccountsByWeeklyRule(prevAccounts.map((account) => (
            account.filePath === filePath
                ? {
                    ...account,
                    usage: update.usage ?? account.usage,
                    lastUsageUpdate: typeof update.cachedAt === 'number' ? update.cachedAt : account.lastUsageUpdate,
                    isTokenExpired: update.isTokenExpired,
                }
                : account
        ))));
    }, []);

    const refreshActiveAccountUsage = useCallback(async (
        filePath: string,
        options?: { markLoading?: boolean; persistCache?: boolean },
    ): Promise<boolean> => {
        if (options?.markLoading) {
            setUsageLoadingByPath((prev) => ({ ...prev, [filePath]: true }));
        }

        try {
            const usage = await fetchActiveUsage();
            const cachedAt = Date.now();
            applyUsageSnapshot(filePath, {
                usage,
                cachedAt,
                isTokenExpired: false,
            }, { persistCache: options?.persistCache });
            return true;
        } catch (error) {
            const errorMessage = toErrorMessage(error);
            const isExpired = errorMessage.includes('401')
                || errorMessage.includes('403')
                || errorMessage.includes('Status: 401')
                || errorMessage.includes('Status: 403');
            const cached = usageCacheRef.current[filePath];
            applyUsageSnapshot(filePath, {
                usage: cached?.usage,
                cachedAt: cached?.cachedAt,
                isTokenExpired: isExpired,
            }, { persistCache: false });
            return false;
        } finally {
            if (options?.markLoading) {
                setUsageLoadingByPath((prev) => ({ ...prev, [filePath]: false }));
            }
        }
    }, [applyUsageSnapshot, fetchActiveUsage]);

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
        setLastFailedMutation(null);

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
                const usageCache = usageCacheRef.current;
                const accountPool = settingsRef.current.accountPool;
                const usageUpdatesByPath: Record<string, UsageSnapshotUpdate> = {};
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
                        lastUsageUpdate: cached?.cachedAt,
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

                await mapWithConcurrency(baseAccounts, USAGE_FETCH_CONCURRENCY, async (account) => {
                    try {
                        const usage = await fetchUsageForAccount(account);
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
                        const errStr = toErrorMessage(error);
                        const isExpired = errStr.includes('401')
                            || errStr.includes('403')
                            || errStr.includes('Status: 401')
                            || errStr.includes('Status: 403');
                        const cached = usageCache[account.filePath];
                        usageUpdatesByPath[account.filePath] = {
                            usage: cached?.usage,
                            cachedAt: cached?.cachedAt,
                            isTokenExpired: isExpired,
                        };
                    } finally {
                        setUsageLoadingByPath((prev) => ({ ...prev, [account.filePath]: false }));
                    }
                });

                if (usageCacheChanged) {
                    usageCacheRef.current = usageCache;
                    saveUsageCache(usageCache);
                }

                const nextAccounts = baseAccounts.map((account) => {
                    const usageUpdate = usageUpdatesByPath[account.filePath];
                    if (!usageUpdate) return account;
                    return {
                        ...account,
                        usage: usageUpdate.usage,
                        lastUsageUpdate: typeof usageUpdate.cachedAt === 'number'
                            ? usageUpdate.cachedAt
                            : account.lastUsageUpdate,
                        isTokenExpired: usageUpdate.isTokenExpired,
                    };
                });
                setAccounts(sortAccountsByWeeklyRule(nextAccounts));
            } catch (error) {
                notifyError(toErrorMessage(error), 'Scan Accounts');
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
    }, [fetchUsageForAccount, notifyError, updateSettings]);

    const switchAccount = useCallback(async (filePath: string): Promise<MutationResult> => {
        const previousAccounts = accounts;
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
            setAccounts(previousAccounts);
            const message = toErrorMessage(error);
            setLastFailedMutation({ kind: 'switch', filePath, message });
            return { success: false, message };
        }
    }, [accounts, refresh, withAccountMutationLock]);

    const checkAutoSwitch = useCallback(async (currentAccounts: AccountInfo[]) => {
        if (!settings.enableAutoSwitch) return;
        if (autoSwitchInFlightRef.current) return;

        const activeAccount = currentAccounts.find(a => a.isActive);
        if (!activeAccount) return;

        const threshold = Math.max(1, Math.min(50, settings.autoSwitchThreshold || DEFAULT_SETTINGS.autoSwitchThreshold));
        const usedPercentLimit = 100 - threshold;
        const nowMs = Date.now();

        // Determine if the current account needs to be switched
        const isExpired = activeAccount.isTokenExpired;
        const activeUsageFresh = isUsageFresh(activeAccount, nowMs, ACTIVE_USAGE_STALE_AFTER_MS);
        const isPrimaryFull = activeUsageFresh && isUsageAtOrAboveLimit(activeAccount, 'primary', usedPercentLimit);
        const isSecondaryFull = activeUsageFresh && isUsageAtOrAboveLimit(activeAccount, 'secondary', usedPercentLimit);

        if (isExpired || isPrimaryFull || isSecondaryFull) {
            const candidates = getRankedSwitchCandidates(currentAccounts, usedPercentLimit, nowMs);

            if (candidates.length === 0) return;

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
        const bestCandidate = getRankedSwitchCandidates(accounts, 99)[0];
        return bestCandidate?.filePath ?? null;
    }, [accounts]);

    const rankedCandidates = useMemo(() => {
        return getRankedSwitchCandidates(accounts, 99).slice(0, 4);
    }, [accounts]);

    useEffect(() => {
        const init = async () => {
            try {
                await commands.importDefaultAccount();
            } catch (e) {
                notifyInfo(`Default account import skipped: ${toErrorMessage(e)}`, 'Accounts');
            }
            await refresh();
        };
        init();
    }, [notifyInfo, refresh]);

    useIntervalTask(settings.autoCheck, settings.checkInterval * 60 * 1000, () => {
        void refresh();
    });

    const activeAccountFilePath = useMemo(
        () => accounts.find((account) => account.isActive)?.filePath ?? null,
        [accounts],
    );

    useEffect(() => {
        if (!activeAccountFilePath || loading) {
            return;
        }
        void refreshActiveAccountUsage(activeAccountFilePath, { markLoading: true, persistCache: true });
    }, [activeAccountFilePath, loading, refreshActiveAccountUsage]);

    useAdaptivePoll({
        enabled: Boolean(activeAccountFilePath) && !loading && !activeAccountMutation,
        baseDelayMs: ACTIVE_ACCOUNT_USAGE_POLL_MS,
        maxDelayMs: ACTIVE_ACCOUNT_USAGE_MAX_BACKOFF_MS,
        task: async () => {
            if (!activeAccountFilePath) {
                return false;
            }
            return await refreshActiveAccountUsage(activeAccountFilePath, {
                markLoading: true,
                persistCache: true,
            });
        },
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
        const previousAccounts = accounts;

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
            setAccounts(previousAccounts);
            await refresh(); // Force sync
            const message = toErrorMessage(error);
            setLastFailedMutation({ kind: 'rename', filePath: oldPath, newName, message });
            return { success: false, message };
        }
    }, [accounts, refresh, withAccountMutationLock]);

    const setAccountsDir = useCallback(async (path: string): Promise<MutationResult> => {
        try {
            await commands.setAccountsDir(path);
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            notifyInfo('Accounts directory updated', 'Accounts');
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: toErrorMessage(error) };
        }
    }, [notifyInfo, refresh]);

    const addAccount = useCallback(async (name: string, content: string): Promise<MutationResult> => {
        try {
            await commands.addAccount(name, content);
            // Add a small delay to ensure FS is flushed before scanning
            await new Promise(resolve => setTimeout(resolve, 500));
            await refresh();
            notifyInfo(`Added account "${name}"`, 'Accounts');
            return { success: true };
        } catch (error: unknown) {
            return { success: false, message: toErrorMessage(error) };
        }
    }, [notifyInfo, refresh]);

    const deleteAccount = useCallback(async (filePath: string): Promise<MutationResult> => {
        const previousAccounts = accounts;
        try {
            await withAccountMutationLock(filePath, 'delete', async () => {
                setAccounts((prevAccounts) => prevAccounts.filter((account) => account.filePath !== filePath));
                await commands.deleteAccount(filePath);
                await new Promise(resolve => setTimeout(resolve, 500));
                await refresh();
            });
            return { success: true };
        } catch (error: unknown) {
            setAccounts(previousAccounts);
            const message = toErrorMessage(error);
            setLastFailedMutation({ kind: 'delete', filePath, message });
            return { success: false, message };
        }
    }, [accounts, refresh, withAccountMutationLock]);

    const refreshAccountToken = useCallback(async (filePath: string): Promise<MutationResult> => {
        try {
            const message = await withAccountMutationLock(filePath, 'refresh-token', async () => {
                const result = await commands.refreshAccountToken(filePath);
                await refresh();
                return result;
            });
            return { success: true, message };
        } catch (error: unknown) {
            const message = toErrorMessage(error);
            setLastFailedMutation({ kind: 'refresh-token', filePath, message });
            return { success: false, message };
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

    const retryLastFailedMutation = useCallback(async (): Promise<void> => {
        if (!lastFailedMutation) return;
        if (lastFailedMutation.kind === 'rename') {
            await renameAccount(lastFailedMutation.filePath, lastFailedMutation.newName);
            return;
        }
        if (lastFailedMutation.kind === 'switch') {
            await switchAccount(lastFailedMutation.filePath);
            return;
        }
        if (lastFailedMutation.kind === 'delete') {
            await deleteAccount(lastFailedMutation.filePath);
            return;
        }
        await refreshAccountToken(lastFailedMutation.filePath);
    }, [deleteAccount, lastFailedMutation, refreshAccountToken, renameAccount, switchAccount]);

    return {
        accounts,
        accountsDir,
        loading,
        usageLoadingByPath,
        activeAccountMutation,
        lastFailedMutation,
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
        retryLastFailedMutation,
        dismissLastFailedMutation: () => setLastFailedMutation(null),
    };
}
