import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from './commands';
import { CommandError } from './errors';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('commands client', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('maps typed backend errors into CommandError', async () => {
    invokeMock.mockRejectedValue({ code: 'AUTH', message: 'Bad credentials' });

    await expect(commands.testWebDavConnection({
      url: 'https://dav.example.com',
      username: 'user',
      password: 'pw',
      remotePath: '/code-revolver/',
    })).rejects.toMatchObject({ name: 'CommandError', message: 'Bad credentials', code: 'AUTH' });
  });

  it('uses the correct command and payload for sync preview', async () => {
    invokeMock.mockResolvedValue({ items: [], uploadCount: 1, downloadCount: 0, conflictCount: 0 });

    await commands.previewSync(
      {
        url: 'https://dav.example.com',
        username: 'user',
        password: 'pw',
        remotePath: '/code-revolver/',
      },
      {
        syncPrompts: true,
        syncSkills: false,
        syncAgentsMd: true,
        syncConfigToml: false,
      },
      true,
    );

    expect(invokeMock).toHaveBeenCalledWith('webdav_sync_preview', {
      config: {
        url: 'https://dav.example.com',
        username: 'user',
        password: 'pw',
        remotePath: '/code-revolver/',
      },
      syncConfig: {
        syncPrompts: true,
        syncSkills: false,
        syncAgentsMd: true,
        syncConfigToml: false,
      },
      syncAccounts: true,
    });
  });

  it('converts plain string failures into CommandError', async () => {
    invokeMock.mockRejectedValue('Request failed');

    try {
      await commands.openAccountsDir();
      throw new Error('Expected command to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandError);
      expect((error as CommandError).message).toBe('Request failed');
    }
  });
});
