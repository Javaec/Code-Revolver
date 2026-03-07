import { AppSettings, DEFAULT_SETTINGS } from '../types';
import { normalizeSettings } from '../hooks/useAccountsModel';
import { commands } from './commands';

const SETTINGS_STORAGE_KEY = 'code_revolver_settings';

export function loadStoredSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return normalizeSettings(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(saved));
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

export function persistSettings(settings: AppSettings): void {
  const persistedSettings = {
    ...settings,
    gateway: {
      ...settings.gateway,
      platformKey: '',
      hasStoredPlatformKey: settings.gateway.hasStoredPlatformKey ?? false,
    },
    webdav: settings.webdav ? {
      ...settings.webdav,
      password: '',
      hasStoredPassword: settings.webdav.hasStoredPassword ?? false,
    } : settings.webdav,
  };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persistedSettings));
}

export async function migrateLegacySecrets(settings: AppSettings): Promise<AppSettings> {
  const legacyPassword = settings.webdav?.password?.trim();
  const legacyGatewayKey = settings.gateway.platformKey?.trim();

  if (legacyPassword) {
    await commands.setWebDavPassword(legacyPassword);
  }
  if (legacyGatewayKey) {
    await commands.setGatewayPlatformKey(legacyGatewayKey);
  }

  return normalizeSettings({
    ...settings,
    gateway: {
      ...settings.gateway,
      platformKey: '',
      hasStoredPlatformKey: settings.gateway.hasStoredPlatformKey ?? Boolean(legacyGatewayKey),
    },
    webdav: settings.webdav ? {
      ...settings.webdav,
      password: '',
      hasStoredPassword: settings.webdav.hasStoredPassword ?? Boolean(legacyPassword),
    } : settings.webdav,
  });
}
