import { describe, expect, it } from 'vitest';
import { WebDavConfig } from '../types';
import {
  buildWebDavRequestConfig,
  hasWebDavCredentials,
  normalizeWebDavRemotePath,
  validateWebDavConfig,
} from './webdav';

function createConfig(overrides: Partial<WebDavConfig> = {}): WebDavConfig {
  return {
    enabled: true,
    url: 'https://dav.example.com/',
    username: 'user@example.com',
    password: 'secret',
    hasStoredPassword: false,
    remotePath: '/code-revolver/',
    ...overrides,
  };
}

describe('webdav utils', () => {
  it('accepts stored credentials even when password field is blank', () => {
    const config = createConfig({ password: '', hasStoredPassword: true });
    expect(hasWebDavCredentials(config)).toBe(true);
    expect(validateWebDavConfig(config)).toBeNull();
  });

  it('normalizes remote paths for backend requests', () => {
    expect(normalizeWebDavRemotePath('nested/path')).toBe('/nested/path/');
    expect(buildWebDavRequestConfig(createConfig({ remotePath: 'nested/path' })).remotePath).toBe('/nested/path/');
  });

  it('rejects malformed URLs', () => {
    expect(validateWebDavConfig(createConfig({ url: 'not-a-url' }))).toBe('WebDAV URL is invalid');
  });
});
