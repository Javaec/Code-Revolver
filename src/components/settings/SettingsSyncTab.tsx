import { invoke } from '@tauri-apps/api/core';
import { AppSettings, DEFAULT_SETTINGS, DEFAULT_SYNC_SETTINGS } from '../../types';
import { hasWebDavCredentials } from '../../lib/webdav';
import { Button, Input } from '../ui';

interface SettingsSyncTabProps {
  settings: AppSettings;
  webdavTesting: boolean;
  webdavMessage: { type: 'success' | 'error'; text: string } | null;
  showWebdavPassword: boolean;
  onToggleShowPassword: () => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onTestConnection: () => void | Promise<void>;
}

function formatLastSyncTime(timestamp?: number): string {
  if (!timestamp) return 'Never synced';
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US');
}

export function SettingsSyncTab({
  settings,
  webdavTesting,
  webdavMessage,
  showWebdavPassword,
  onToggleShowPassword,
  onUpdateSettings,
  onTestConnection,
}: SettingsSyncTabProps) {
  const webdav = settings.webdav || DEFAULT_SETTINGS.webdav!;
  const sync = settings.sync || DEFAULT_SYNC_SETTINGS;

  const updateWebdav = (updates: Partial<typeof webdav>) => {
    onUpdateSettings({
      webdav: { ...webdav, ...updates },
    });
  };

  const updateSync = (updates: Partial<typeof sync>) => {
    onUpdateSettings({
      sync: { ...sync, ...updates },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={async () => {
            try {
              await invoke('open_codex_dir');
            } catch (e) {
              console.error('Failed to open directory:', e);
            }
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          Open .codex Directory
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-200">WebDAV Cloud Sync</div>
            <div className="text-xs text-slate-400">Sync accounts and settings across devices</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={webdav.enabled}
              onChange={(e) => updateWebdav({ enabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
          </label>
        </div>

        {webdav.enabled && (
          <div className="space-y-3 pl-1">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-2">Nutstore (JianGuoYun) setup:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Log in to <a href="https://www.jianguoyun.com" target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">Nutstore Website</a></li>
                <li>Account Info - Security - 3rd Party App Management</li>
                <li>Add App Password - Generate Password</li>
              </ol>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Server Address</label>
              <Input
                type="text"
                value={webdav.url}
                onChange={(e) => updateWebdav({ url: e.target.value })}
                placeholder="https://dav.jianguoyun.com/dav/"
                className="text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
              <Input
                type="text"
                value={webdav.username}
                onChange={(e) => updateWebdav({ username: e.target.value })}
                placeholder="your@email.com"
                className="text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">App Password</label>
              <div className="flex gap-2">
                <Input
                  type={showWebdavPassword ? 'text' : 'password'}
                  value={webdav.password}
                  onChange={(e) => updateWebdav({ password: e.target.value })}
                  placeholder="App-specific password"
                  className="text-sm flex-1"
                />
                <Button variant="outline" size="sm" onClick={onToggleShowPassword}>
                  {showWebdavPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Remote Directory</label>
              <Input
                type="text"
                value={webdav.remotePath}
                onChange={(e) => updateWebdav({ remotePath: e.target.value })}
                placeholder="/code-revolver/"
                className="text-sm"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void onTestConnection()}
              disabled={webdavTesting || !hasWebDavCredentials(webdav)}
            >
              {webdavTesting ? 'Testing...' : 'Test Connection'}
            </Button>

            {webdavMessage && (
              <div
                className={`rounded-xl p-3 text-xs ${
                  webdavMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {webdavMessage.text}
              </div>
            )}
          </div>
        )}
      </div>

      {webdav.enabled && (
        <>
          <div className="h-px bg-white/10" />

          <div className="space-y-3">
            <div className="font-medium text-slate-200">Sync Content</div>

            <label className="flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={sync.syncAccounts}
                onChange={(e) => updateSync({ syncAccounts: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 bg-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm text-white">Account Files</div>
                <div className="text-xs text-slate-400">auth.json authentication files</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={sync.syncPrompts}
                onChange={(e) => updateSync({ syncPrompts: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 bg-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm text-white">Prompts</div>
                <div className="text-xs text-slate-400">~/.codex/prompts/</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={sync.syncSkills}
                onChange={(e) => updateSync({ syncSkills: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 bg-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm text-white">Skills</div>
                <div className="text-xs text-slate-400">~/.codex/skills/</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={sync.syncAgentsMd}
                onChange={(e) => updateSync({ syncAgentsMd: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 bg-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm text-white">AGENTS.MD</div>
                <div className="text-xs text-slate-400">System prompts</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={sync.syncConfigToml}
                onChange={(e) => updateSync({ syncConfigToml: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 bg-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm text-white flex items-center gap-2">
                  config.toml
                  <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded border border-amber-500/30">Caution</span>
                </div>
                <div className="text-xs text-slate-400">MCP paths may vary by device</div>
              </div>
            </label>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Last Sync</span>
              <span className="text-xs text-slate-300">{formatLastSyncTime(sync.lastSyncTime)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
