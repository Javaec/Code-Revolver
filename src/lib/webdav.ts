import { WebDavConfig } from '../types';

export interface WebDavRequestConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
}

export function hasWebDavCredentials(config: WebDavConfig): boolean {
  return config.username.trim().length > 0
    && (config.password.trim().length > 0 || Boolean(config.hasStoredPassword));
}

export function normalizeWebDavRemotePath(remotePath: string): string {
  const trimmed = remotePath.trim();
  if (!trimmed) return '/code-revolver/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function validateWebDavConfig(config: WebDavConfig): string | null {
  if (!config.enabled) {
    return 'Please configure and enable WebDAV in settings first';
  }

  if (!config.url.trim()) {
    return 'WebDAV URL is required';
  }

  try {
    const parsed = new URL(config.url);
    if (!parsed.protocol.startsWith('http')) {
      return 'WebDAV URL must use http or https';
    }
  } catch {
    return 'WebDAV URL is invalid';
  }

  if (!config.username.trim()) {
    return 'WebDAV username is required';
  }

  if (!hasWebDavCredentials(config)) {
    return 'WebDAV password is required';
  }

  if (!config.remotePath.trim()) {
    return 'WebDAV remote path is required';
  }

  return null;
}

export function buildWebDavRequestConfig(config: WebDavConfig): WebDavRequestConfig {
  return {
    url: config.url.trim(),
    username: config.username.trim(),
    password: config.password,
    remotePath: normalizeWebDavRemotePath(config.remotePath),
  };
}
