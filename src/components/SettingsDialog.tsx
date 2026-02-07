import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppSettings, DEFAULT_SETTINGS, DEFAULT_SYNC_SETTINGS } from '../types';
import { useAccounts } from '../hooks/useAccounts';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Button, Card, Input } from './ui';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};

const dialogVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15 } },
  exit: { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.1 } },
};

type SettingsTab = 'general' | 'sync';

export function SettingsDialog({ isOpen, onClose, settings, onUpdateSettings }: SettingsDialogProps) {
  const { getAccountsDir, setAccountsDir } = useAccounts();
  const [localDir, setLocalDir] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavMessage, setWebdavMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);

  const webdav = settings.webdav || DEFAULT_SETTINGS.webdav!;
  const sync = settings.sync || DEFAULT_SYNC_SETTINGS;

  useEffect(() => {
    if (isOpen) {
      getAccountsDir().then(setLocalDir);
      setWebdavMessage(null);
    }
  }, [isOpen, getAccountsDir]);

  const handleSaveDir = async () => {
    if (localDir) await setAccountsDir(localDir);
  };

  const handleBrowseDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: localDir || undefined,
      title: 'Select Account Data Directory',
    });
    if (selected && typeof selected === 'string') {
      setLocalDir(selected);
      await setAccountsDir(selected);
    }
  };

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

  const handleTestConnection = async () => {
    setWebdavTesting(true);
    setWebdavMessage(null);
    try {
      const result = await invoke<string>('webdav_test_connection', {
        config: {
          url: webdav.url,
          username: webdav.username,
          password: webdav.password,
          remotePath: webdav.remotePath,
        },
      });
      setWebdavMessage({ type: 'success', text: result });
    } catch (e: unknown) {
      setWebdavMessage({ type: 'error', text: String(e) });
    } finally {
      setWebdavTesting(false);
    }
  };

  const formatLastSyncTime = (timestamp?: number) => {
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
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={overlayVariants}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            variants={dialogVariants}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <Card className="p-6 border-white/20 bg-white/15 backdrop-blur-[20px]">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gradient">Settings</h3>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <Button
                onClick={() => setActiveTab('general')}
                variant={activeTab === 'general' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-8 px-4 ${
                  activeTab === 'general'
                    ? 'text-primary-300 border-primary-500/40 bg-primary-500/10'
                    : 'text-slate-400'
                }`}
              >
                General
              </Button>
              <Button
                onClick={() => setActiveTab('sync')}
                variant={activeTab === 'sync' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-8 px-4 ${
                  activeTab === 'sync'
                    ? 'text-primary-300 border-primary-500/40 bg-primary-500/10'
                    : 'text-slate-400'
                }`}
              >
                Cloud Sync
              </Button>
            </div>

            {/* Tab Content */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* Data Directory */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Account Data Directory</label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={localDir}
                      onChange={(e) => setLocalDir(e.target.value)}
                      className="flex-1 text-sm"
                    />
                    <Button variant="outline" size="sm" onClick={handleBrowseDir}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSaveDir}>
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Existing JSON files will be automatically copied to the new directory after modification</p>
                </div>

                <div className="h-px bg-white/10" />

                {/* Auto Check */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-200">Auto Background Check</div>
                    <div className="text-xs text-slate-400">Periodically scan account status and usage</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.autoCheck}
                      onChange={(e) => onUpdateSettings({ autoCheck: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
                  </label>
                </div>

                {settings.autoCheck && (
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Check Interval (minutes)</label>
                    <Input
                      type="number"
                      min="5"
                      max="1440"
                      value={settings.checkInterval}
                      onChange={(e) => onUpdateSettings({ checkInterval: parseInt(e.target.value) || 30 })}
                      className="w-32"
                    />
                  </div>
                )}

                <div className="h-px bg-white/10" />

                {/* Smart Scheduling */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-200">Smart Auto Switch</div>
                    <div className="text-xs text-slate-400">Automatically switch to the best candidate based on remaining quota</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.enableAutoSwitch}
                      onChange={(e) => onUpdateSettings({ enableAutoSwitch: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                  </label>
                </div>

                {settings.enableAutoSwitch && (
                  <div className="pl-1 space-y-2">
                    <label className="block text-sm font-medium text-slate-400">Auto switch when remaining quota is below (%)</label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={settings.autoSwitchThreshold}
                      onChange={(e) => {
                        const val = Math.min(50, Math.max(1, parseInt(e.target.value) || settings.autoSwitchThreshold));
                        onUpdateSettings({ autoSwitchThreshold: val });
                      }}
                      className="w-32"
                    />
                    <p className="text-xs text-slate-500">For example, if set to 5, it will switch when remaining quota is &lt;= 5%</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'sync' && (
              <div className="space-y-6">
                {/* Actions */}
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

                {/* WebDAV Config */}
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
                      {/* Instructions */}
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
                          <Button variant="outline" size="sm" onClick={() => setShowWebdavPassword((v) => !v)}>
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
                        onClick={handleTestConnection}
                        disabled={webdavTesting || !webdav.username || !webdav.password}
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

                    {/* Sync Content */}
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

                    {/* Last Sync Time */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Last Sync</span>
                        <span className="text-xs text-slate-300">{formatLastSyncTime(sync.lastSyncTime)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
