import { invoke } from '@tauri-apps/api/core';
import type {
  BackendAppConfig,
  CodexSyncConfig,
  PromptInfo,
  ScanResult,
  SkillInfo,
  SyncPreview,
  SyncResult,
  UsageInfo,
} from '../types';
import { CommandError, toErrorMessage } from './errors';
import type { WebDavRequestConfig } from './webdav';

function toCommandError(error: unknown): CommandError {
  const message = toErrorMessage(error);
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    return new CommandError(message, code || undefined);
  }
  return new CommandError(message);
}

async function invokeCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, payload);
  } catch (error) {
    throw toCommandError(error);
  }
}

export const commands = {
  openAccountsDir: () => invokeCommand<string>('open_accounts_dir'),
  openCodexDir: () => invokeCommand<string>('open_codex_dir'),
  scanAccounts: () => invokeCommand<ScanResult>('scan_accounts'),
  fetchUsage: (filePath: string) => invokeCommand<UsageInfo>('fetch_usage', { filePath }),
  switchAccount: (filePath: string) => invokeCommand<void>('switch_account', { filePath }),
  renameAccount: (oldPath: string, newName: string) => invokeCommand<void>('rename_account', { oldPath, newName }),
  getAccountsDirPath: () => invokeCommand<string>('get_accounts_dir_path'),
  getAppConfig: () => invokeCommand<BackendAppConfig>('get_app_config'),
  setDebugLogging: (enabled: boolean) => invokeCommand<BackendAppConfig>('set_debug_logging', { enabled }),
  setAccountsDir: (path: string) => invokeCommand<void>('set_accounts_dir', { path }),
  addAccount: (name: string, content: string) => invokeCommand<void>('add_account', { name, content }),
  deleteAccount: (filePath: string) => invokeCommand<void>('delete_account', { filePath }),
  readAccountContent: (filePath: string) => invokeCommand<string>('read_account_content', { filePath }),
  updateAccountContent: (filePath: string, content: string) => invokeCommand<void>('update_account_content', { filePath, content }),
  refreshAccountToken: (filePath: string) => invokeCommand<string>('refresh_account_token', { filePath }),
  importDefaultAccount: () => invokeCommand<boolean>('import_default_account'),
  getWebDavPassword: () => invokeCommand<string | null>('get_webdav_password'),
  setWebDavPassword: (password: string) => invokeCommand<void>('set_webdav_password', { password }),
  getGatewayPlatformKey: () => invokeCommand<string | null>('get_gateway_platform_key'),
  setGatewayPlatformKey: (platformKey: string) => invokeCommand<void>('set_gateway_platform_key', { platformKey }),
  testWebDavConnection: (config: WebDavRequestConfig) => invokeCommand<string>('webdav_test_connection', { config }),
  previewSync: (config: WebDavRequestConfig, syncConfig: CodexSyncConfig, syncAccounts: boolean) =>
    invokeCommand<SyncPreview>('webdav_sync_preview', { config, syncConfig, syncAccounts }),
  syncAccountsUpload: (config: WebDavRequestConfig) => invokeCommand<SyncResult>('webdav_sync_upload', { config }),
  syncAccountsDownload: (config: WebDavRequestConfig) => invokeCommand<SyncResult>('webdav_sync_download', { config }),
  syncCodexUpload: (config: WebDavRequestConfig, syncConfig: CodexSyncConfig) =>
    invokeCommand<SyncResult>('webdav_sync_codex_upload', { config, syncConfig }),
  syncCodexDownload: (config: WebDavRequestConfig, syncConfig: CodexSyncConfig) =>
    invokeCommand<SyncResult>('webdav_sync_codex_download', { config, syncConfig }),
  scanPrompts: () => invokeCommand<PromptInfo[]>('scan_prompts'),
  savePromptContent: (filePath: string, content: string) => invokeCommand<void>('save_prompt_content', { filePath, content }),
  createPrompt: (name: string, description: string, content: string) => invokeCommand<string>('create_prompt', { name, description, content }),
  deletePrompt: (filePath: string) => invokeCommand<void>('delete_prompt', { filePath }),
  scanSkills: () => invokeCommand<SkillInfo[]>('scan_skills'),
  readSkillContent: (dirPath: string) => invokeCommand<string>('read_skill_content', { dirPath }),
  saveSkillContent: (dirPath: string, content: string) => invokeCommand<void>('save_skill_content', { dirPath, content }),
  createSkill: (name: string, description: string) => invokeCommand<string>('create_skill', { name, description }),
  deleteSkill: (dirPath: string) => invokeCommand<void>('delete_skill', { dirPath }),
  readAgentsMd: () => invokeCommand<string>('read_agents_md'),
  saveAgentsMd: (content: string) => invokeCommand<void>('save_agents_md', { content }),
  readConfigToml: () => invokeCommand<string>('read_config_toml'),
  saveConfigToml: (content: string) => invokeCommand<void>('save_config_toml', { content }),
};
