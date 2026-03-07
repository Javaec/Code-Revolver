import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsProvider } from '../lib/notifications';
import { useAccounts } from './useAccounts';

const { commandsMock, adaptivePollState } = vi.hoisted(() => ({
  commandsMock: {
    openAccountsDir: vi.fn(),
    openCodexDir: vi.fn(),
    scanAccounts: vi.fn(),
    fetchUsage: vi.fn(),
    fetchActiveUsage: vi.fn(),
    switchAccount: vi.fn(),
    renameAccount: vi.fn(),
    getAccountsDirPath: vi.fn(),
    getAppConfig: vi.fn(),
    setDebugLogging: vi.fn(),
    setAccountsDir: vi.fn(),
    addAccount: vi.fn(),
    deleteAccount: vi.fn(),
    readAccountContent: vi.fn(),
    updateAccountContent: vi.fn(),
    refreshAccountToken: vi.fn(),
    importDefaultAccount: vi.fn(),
    getWebDavPassword: vi.fn(),
    setWebDavPassword: vi.fn(),
    getGatewayPlatformKey: vi.fn(),
    setGatewayPlatformKey: vi.fn(),
    testWebDavConnection: vi.fn(),
    previewSync: vi.fn(),
    syncAccountsUpload: vi.fn(),
    syncAccountsDownload: vi.fn(),
    syncCodexUpload: vi.fn(),
    syncCodexDownload: vi.fn(),
    scanPrompts: vi.fn(),
    savePromptContent: vi.fn(),
    createPrompt: vi.fn(),
    deletePrompt: vi.fn(),
    scanSkills: vi.fn(),
    readSkillContent: vi.fn(),
    saveSkillContent: vi.fn(),
    createSkill: vi.fn(),
    deleteSkill: vi.fn(),
    readAgentsMd: vi.fn(),
    saveAgentsMd: vi.fn(),
    readConfigToml: vi.fn(),
    saveConfigToml: vi.fn(),
  },
  adaptivePollState: {
    config: null as { enabled: boolean; task: () => Promise<boolean> } | null,
  },
}));

vi.mock('../lib/commands', () => ({
  commands: commandsMock,
}));

vi.mock('./useAdaptivePoll', () => ({
  useAdaptivePoll: (config: { enabled: boolean; task: () => Promise<boolean> }) => {
    adaptivePollState.config = config;
  },
}));

vi.mock('./useIntervalTask', () => ({
  useIntervalTask: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

describe('useAccounts', () => {
  beforeEach(() => {
    localStorage.clear();
    adaptivePollState.config = null;
    Object.values(commandsMock).forEach((mock) => mock.mockReset());

    commandsMock.importDefaultAccount.mockResolvedValue(false);
    commandsMock.getWebDavPassword.mockResolvedValue(null);
    commandsMock.setWebDavPassword.mockResolvedValue(undefined);
    commandsMock.getGatewayPlatformKey.mockResolvedValue(null);
    commandsMock.setGatewayPlatformKey.mockResolvedValue(undefined);
  });

  it('updates active account usage through fetchActiveUsage polling', async () => {
    commandsMock.scanAccounts.mockResolvedValue({
      accountsDir: 'E:/accounts',
      accounts: [
        {
          id: 'active',
          name: 'Active',
          email: 'active@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: true,
          filePath: 'E:/accounts/active.json',
          authUpdatedAt: 1,
          lastRefresh: 'now',
        },
      ],
    });
    commandsMock.fetchUsage.mockResolvedValue({
      primaryWindow: { usedPercent: 10 },
      secondaryWindow: { usedPercent: 20 },
    });
    commandsMock.fetchActiveUsage.mockResolvedValue({
      primaryWindow: { usedPercent: 55 },
      secondaryWindow: { usedPercent: 25 },
    });

    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });

    expect(adaptivePollState.config?.enabled).toBe(true);

    await act(async () => {
      await adaptivePollState.config?.task();
    });

    await waitFor(() => {
      expect(result.current.accounts[0].usage?.primaryWindow?.usedPercent).toBe(55);
    });
  });

  it('prefers live active usage during the full refresh pass', async () => {
    commandsMock.scanAccounts.mockResolvedValue({
      accountsDir: 'E:/accounts',
      accounts: [
        {
          id: 'active',
          name: 'Active',
          email: 'active@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: true,
          filePath: 'E:/accounts/active.json',
          authUpdatedAt: 1,
          lastRefresh: 'now',
        },
        {
          id: 'standby',
          name: 'Standby',
          email: 'standby@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: false,
          filePath: 'E:/accounts/standby.json',
          authUpdatedAt: 2,
          lastRefresh: 'now',
        },
      ],
    });
    commandsMock.fetchActiveUsage.mockResolvedValue({
      primaryWindow: { usedPercent: 77 },
      secondaryWindow: { usedPercent: 33 },
    });
    commandsMock.fetchUsage.mockImplementation(async (filePath: string) => ({
      primaryWindow: { usedPercent: filePath.includes('standby') ? 12 : 5 },
      secondaryWindow: { usedPercent: filePath.includes('standby') ? 18 : 6 },
    }));

    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(2);
    });

    await waitFor(() => {
      const activeAccount = result.current.accounts.find((account) => account.isActive);
      expect(activeAccount?.usage?.primaryWindow?.usedPercent).toBe(77);
    });

    expect(commandsMock.fetchUsage).not.toHaveBeenCalledWith('E:/accounts/active.json');
    expect(commandsMock.fetchUsage).toHaveBeenCalledWith('E:/accounts/standby.json');
  });

  it('does not stamp a fresh usage time when usage fetch fails without cache', async () => {
    commandsMock.scanAccounts.mockResolvedValue({
      accountsDir: 'E:/accounts',
      accounts: [
        {
          id: 'active',
          name: 'Active',
          email: 'active@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: true,
          filePath: 'E:/accounts/active.json',
          authUpdatedAt: 1,
          lastRefresh: 'now',
        },
      ],
    });
    commandsMock.fetchActiveUsage.mockRejectedValue(new Error('usage unavailable'));
    commandsMock.fetchUsage.mockRejectedValue(new Error('usage unavailable'));

    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });

    await waitFor(() => {
      expect(result.current.usageLoadingByPath['E:/accounts/active.json']).toBe(false);
    });

    expect(result.current.accounts[0].usage).toBeUndefined();
    expect(result.current.accounts[0].lastUsageUpdate).toBeUndefined();
  });

  it('rejects competing mutations while one account action is in flight', async () => {
    let resolveSwitch: (() => void) | null = null;

    commandsMock.scanAccounts.mockResolvedValue({
      accountsDir: 'E:/accounts',
      accounts: [
        {
          id: 'active',
          name: 'Active',
          email: 'active@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: true,
          filePath: 'E:/accounts/active.json',
          authUpdatedAt: 1,
          lastRefresh: 'now',
        },
        {
          id: 'spare',
          name: 'Spare',
          email: 'spare@example.com',
          planType: 'plus',
          subscriptionEnd: null,
          isActive: false,
          filePath: 'E:/accounts/spare.json',
          authUpdatedAt: 2,
          lastRefresh: 'now',
        },
      ],
    });
    commandsMock.fetchUsage.mockResolvedValue({
      primaryWindow: { usedPercent: 10 },
      secondaryWindow: { usedPercent: 20 },
    });
    commandsMock.switchAccount.mockImplementation(() => new Promise<void>((resolve) => {
      resolveSwitch = resolve;
    }));

    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(2);
    });

    let switchPromise: Promise<unknown>;
    await act(async () => {
      switchPromise = result.current.switchAccount('E:/accounts/spare.json');
    });

    let deleteResult: { success: boolean; message?: string } = { success: true };
    await act(async () => {
      deleteResult = await result.current.deleteAccount('E:/accounts/active.json');
    });

    expect(deleteResult.success).toBe(false);
    expect(deleteResult.message).toContain('Another account action');

    await act(async () => {
      resolveSwitch?.();
      await switchPromise;
    });
  });
});
