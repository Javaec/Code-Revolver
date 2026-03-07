import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppSettings, DEFAULT_SETTINGS, MutationResult, WebDavConfig } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { Button, Card } from './ui';
import { resolveWebDavRequestConfig, validateWebDavConfig } from '../lib/webdav';
import { SettingsGeneralTab } from './settings/SettingsGeneralTab';
import { SettingsSyncTab } from './settings/SettingsSyncTab';
import { commands } from '../lib/commands';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  accountsDir: string;
  onSetAccountsDir: (path: string) => Promise<MutationResult>;
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

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  accountsDir,
  onSetAccountsDir,
  onUpdateSettings,
}: SettingsDialogProps) {
  const [localDir, setLocalDir] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavMessage, setWebdavMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);
  const [loadingWebdavPassword, setLoadingWebdavPassword] = useState(false);
  const [webdavDraft, setWebdavDraft] = useState<WebDavConfig>(settings.webdav || DEFAULT_SETTINGS.webdav!);
  const [debugLogging, setDebugLogging] = useState(false);
  const [debugLoggingBusy, setDebugLoggingBusy] = useState(false);
  const { notifyError, notifySuccess } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      setLocalDir(accountsDir);
      setWebdavDraft(settings.webdav || DEFAULT_SETTINGS.webdav!);
      setWebdavMessage(null);
      void commands.getAppConfig()
        .then((config) => setDebugLogging(config.debugLogging))
        .catch((error) => notifyError(toErrorMessage(error), 'Debug Logging'));
    } else {
      setShowWebdavPassword(false);
      setWebdavDraft((prev) => ({ ...prev, password: '' }));
    }
  }, [accountsDir, isOpen, notifyError, settings.webdav]);

  const handleUpdateWebDav = (updates: Partial<WebDavConfig>) => {
    setWebdavDraft((prev) => {
      const next = { ...prev, ...updates };
      onUpdateSettings({ webdav: next });
      return next;
    });
  };

  const handleToggleShowPassword = async () => {
    const next = !showWebdavPassword;
    setShowWebdavPassword(next);
    if (!next) {
      setWebdavDraft((prev) => ({ ...prev, password: '' }));
      return;
    }
    if (webdavDraft.password || !webdavDraft.hasStoredPassword) {
      return;
    }

    setLoadingWebdavPassword(true);
    try {
      const password = await commands.getWebDavPassword();
      if (password) {
        setWebdavDraft((prev) => ({ ...prev, password }));
      }
    } catch (error) {
      notifyError(toErrorMessage(error), 'WebDAV Password');
    } finally {
      setLoadingWebdavPassword(false);
    }
  };

  const handleSaveDir = async () => {
    if (localDir) await onSetAccountsDir(localDir);
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
      await onSetAccountsDir(selected);
    }
  };

  const handleTestConnection = async () => {
    const validationError = validateWebDavConfig(webdavDraft);
    if (validationError) {
      setWebdavMessage({ type: 'error', text: validationError });
      return;
    }

    setWebdavTesting(true);
    setWebdavMessage(null);
    try {
      const result = await commands.testWebDavConnection(await resolveWebDavRequestConfig(webdavDraft));
      setWebdavMessage({ type: 'success', text: result });
    } catch (e: unknown) {
      setWebdavMessage({ type: 'error', text: toErrorMessage(e) });
    } finally {
      setWebdavTesting(false);
    }
  };

  const handleToggleDebugLogging = async (enabled: boolean) => {
    setDebugLoggingBusy(true);
    try {
      const config = await commands.setDebugLogging(enabled);
      setDebugLogging(config.debugLogging);
      notifySuccess(enabled ? 'Structured debug logging enabled' : 'Structured debug logging disabled', 'Debug Logging');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Debug Logging');
    } finally {
      setDebugLoggingBusy(false);
    }
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
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={overlayVariants}
            onClick={onClose}
          />

          <motion.div
            className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            variants={dialogVariants}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <Card className="p-6 border-white/20 bg-white/15 backdrop-blur-[20px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gradient">Settings</h3>
                <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <div className="flex gap-2 mb-6">
                <Button
                  onClick={() => setActiveTab('general')}
                  variant={activeTab === 'general' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-8 px-4 ${activeTab === 'general' ? 'text-primary-300 border-primary-500/40 bg-primary-500/10' : 'text-slate-400'}`}
                >
                  General
                </Button>
                <Button
                  onClick={() => setActiveTab('sync')}
                  variant={activeTab === 'sync' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-8 px-4 ${activeTab === 'sync' ? 'text-primary-300 border-primary-500/40 bg-primary-500/10' : 'text-slate-400'}`}
                >
                  Cloud Sync
                </Button>
              </div>

              {activeTab === 'general' ? (
                <SettingsGeneralTab
                  localDir={localDir}
                  settings={settings}
                  debugLogging={debugLogging}
                  debugLoggingBusy={debugLoggingBusy}
                  onLocalDirChange={setLocalDir}
                  onBrowseDir={handleBrowseDir}
                  onSaveDir={handleSaveDir}
                  onToggleDebugLogging={handleToggleDebugLogging}
                  onUpdateSettings={onUpdateSettings}
                />
              ) : (
                <SettingsSyncTab
                  settings={settings}
                  webdav={webdavDraft}
                  webdavTesting={webdavTesting}
                  webdavMessage={webdavMessage}
                  loadingWebdavPassword={loadingWebdavPassword}
                  showWebdavPassword={showWebdavPassword}
                  onToggleShowPassword={handleToggleShowPassword}
                  onUpdateWebDav={handleUpdateWebDav}
                  onUpdateSettings={onUpdateSettings}
                  onTestConnection={handleTestConnection}
                />
              )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
