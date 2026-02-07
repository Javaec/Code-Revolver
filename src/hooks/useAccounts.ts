import { useState, useEffect, useCallback, useMemo } from 'react';
import { AccountInfo, ScanResult, UsageInfo, AppSettings, DEFAULT_SETTINGS, MutationResult } from '../types';
import { invoke } from '@tauri-apps/api/core';

export function useAccounts() {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [accountsDir, setAccountsDirState] = useState<string>('');
    const [loading, setLoading] = useState(true);

    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const saved = localStorage.getItem('code_revolver_settings');
            return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        } catch {
            return DEFAULT_SETTINGS;
        }
    });

    const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...newSettings };
            localStorage.setItem('code_revolver_settings', JSON.stringify(next));
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

            const accountsWithUsage = await Promise.all(
                result.accounts.map(async (account) => {
                    try {
                        const usage = await fetchUsage(account.filePath);
                        return {
                            ...account,
                            usage,
                            lastUsageUpdate: Date.now(),
                            isTokenExpired: false
                        };
                    } catch (error: unknown) {
                        const errStr = String(error);
                        const isExpired = errStr.includes('401') || errStr.includes('403') || errStr.includes('Status: 401') || errStr.includes('Status: 403');
                        return {
                            ...account,
                            usage: undefined,
                            lastUsageUpdate: Date.now(),
                            isTokenExpired: isExpired
                        };
                    }
                })
            );

            // Sort: active accounts first, then by name
            accountsWithUsage.sort((a, b) => {
                if (a.isActive && !b.isActive) return -1;
                if (!a.isActive && b.isActive) return 1;
                return a.name.localeCompare(b.name, 'en-US');
            });

            setAccounts(accountsWithUsage);

        } catch (error) {
            console.error('Failed to scan accounts:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchUsage]);

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

            // Sorting algorithm: Account with the earliest weekly reset time (Smallest ResetsAt)
            candidates.sort((a, b) => {
                const resetA = a.usage?.secondaryWindow?.resetsAt || Number.MAX_SAFE_INTEGER;
                const resetB = b.usage?.secondaryWindow?.resetsAt || Number.MAX_SAFE_INTEGER;
                return resetA - resetB;
            });

            const bestAccount = candidates[0];
            // Perform switch
            await switchAccount(bestAccount.filePath);
        }
    }, [settings.enableAutoSwitch, settings.autoSwitchThreshold, switchAccount]);

    // Calculate Best Candidate account
    const bestCandidateId = useMemo(() => {
        const candidates = accounts.filter(acc => {
            if (acc.isTokenExpired) return false;
            // Strict usage check. If account is > 99%, we probably shouldn't count it as "Best" available.
            if ((acc.usage?.primaryWindow?.usedPercent || 0) >= 99) return false;
            if ((acc.usage?.secondaryWindow?.usedPercent || 0) >= 99) return false;
            return true;
        });

        if (candidates.length === 0) return null;

        // Sort: solely based on earliest weekly reset time (Smallest ResetsAt)
        candidates.sort((a, b) => {
            const resetA = a.usage?.secondaryWindow?.resetsAt || Number.MAX_SAFE_INTEGER;
            const resetB = b.usage?.secondaryWindow?.resetsAt || Number.MAX_SAFE_INTEGER;
            return resetA - resetB;
        });

        return candidates[0].id;
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

    return {
        accounts,
        accountsDir,
        loading,
        settings,
        updateSettings,
        refresh,
        switchAccount,
        renameAccount,
        setAccountsDir,
        addAccount,
        deleteAccount,
        getAccountsDir,
        bestCandidateId,
    };
}
