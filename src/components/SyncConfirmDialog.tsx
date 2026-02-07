import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { WebDavConfig, SyncSettings, SyncResult, DEFAULT_SYNC_SETTINGS } from '../types';
import { Button, Card } from './ui';

interface SyncConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  webdavConfig: WebDavConfig;
  syncSettings: SyncSettings;
  onSyncComplete: (lastSyncTime: number) => void;
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

export function SyncConfirmDialog({ 
  isOpen, 
  onClose, 
  webdavConfig, 
  syncSettings,
  onSyncComplete 
}: SyncConfirmDialogProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncDirection, setSyncDirection] = useState<'upload' | 'download' | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const sync = syncSettings || DEFAULT_SYNC_SETTINGS;

  // Reset state
  useEffect(() => {
    if (isOpen) {
      setSyncResult(null);
      setSyncDirection(null);
    }
  }, [isOpen]);

  const getSyncItems = () => {
    const items: string[] = [];
    if (sync.syncAccounts) items.push('Accounts');
    if (sync.syncPrompts) items.push('Prompts');
    if (sync.syncSkills) items.push('Skills');
    if (sync.syncAgentsMd) items.push('AGENTS.MD');
    if (sync.syncConfigToml) items.push('config.toml');
    return items;
  };

  const handleSync = async (direction: 'upload' | 'download') => {
    if (!webdavConfig.enabled) {
      setSyncResult({
        uploaded: [],
        downloaded: [],
        errors: ['Please configure and enable WebDAV in settings first'],
      });
      return;
    }

    setSyncing(true);
    setSyncDirection(direction);
    setSyncResult(null);

    try {
      const config = {
        url: webdavConfig.url,
        username: webdavConfig.username,
        password: webdavConfig.password,
        remotePath: webdavConfig.remotePath,
      };

      const syncConfig = {
        syncPrompts: sync.syncPrompts,
        syncSkills: sync.syncSkills,
        syncAgentsMd: sync.syncAgentsMd,
        syncConfigToml: sync.syncConfigToml,
      };

      const result: SyncResult = { uploaded: [], downloaded: [], errors: [] };

      if (direction === 'upload') {
        // Upload Codex config
        const codexResult = await invoke<SyncResult>('webdav_sync_codex_upload', { config, syncConfig });
        result.uploaded.push(...codexResult.uploaded);
        result.errors.push(...codexResult.errors);

        // Upload account files
        if (sync.syncAccounts) {
          const accountResult = await invoke<SyncResult>('webdav_sync_upload', { config });
          result.uploaded.push(...accountResult.uploaded.map(f => `Account: ${f}`));
          result.errors.push(...accountResult.errors);
        }
      } else {
        // Download Codex config
        const codexResult = await invoke<SyncResult>('webdav_sync_codex_download', { config, syncConfig });
        result.downloaded.push(...codexResult.downloaded);
        result.errors.push(...codexResult.errors);

        // Download account files
        if (sync.syncAccounts) {
          const accountResult = await invoke<SyncResult>('webdav_sync_download', { config });
          result.downloaded.push(...accountResult.downloaded.map(f => `Account: ${f}`));
          result.errors.push(...accountResult.errors);
        }
      }

      setSyncResult(result);

      // Update last sync time
      if (result.errors.length === 0 || result.uploaded.length > 0 || result.downloaded.length > 0) {
        onSyncComplete(Date.now());
      }
    } catch (error) {
      setSyncResult({
        uploaded: [],
        downloaded: [],
        errors: [String(error)],
      });
    } finally {
      setSyncing(false);
      setSyncDirection(null);
    }
  };

  const syncItems = getSyncItems();
  const hasItems = syncItems.length > 0;
  const isSuccess = syncResult && syncResult.errors.length === 0;

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
            className="relative w-full max-w-sm mx-4"
            variants={dialogVariants}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <Card className="p-5 border-white/20 bg-white/15 backdrop-blur-[20px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gradient">Cloud Sync</h3>
              <Button
                onClick={onClose}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            {/* Sync Result */}
            {syncResult ? (
              <div className="space-y-3">
                <div className={`p-3 rounded-xl ${isSuccess ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                  <div className={`text-sm font-medium ${isSuccess ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isSuccess ? 'Sync complete' : 'Sync encountered issues'}
                  </div>
                </div>

                {syncResult.uploaded.length > 0 && (
                  <div className="text-xs">
                    <div className="text-slate-400 mb-1">Uploaded ({syncResult.uploaded.length})</div>
                    <div className="text-slate-300 max-h-24 overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-white/5 p-2">
                      {syncResult.uploaded.map((item, i) => (
                        <div key={i} className="truncate">{item}</div>
                      ))}
                    </div>
                  </div>
                )}

                {syncResult.downloaded.length > 0 && (
                  <div className="text-xs">
                    <div className="text-slate-400 mb-1">Downloaded ({syncResult.downloaded.length})</div>
                    <div className="text-slate-300 max-h-24 overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-white/5 p-2">
                      {syncResult.downloaded.map((item, i) => (
                        <div key={i} className="truncate">{item}</div>
                      ))}
                    </div>
                  </div>
                )}

                {syncResult.errors.length > 0 && (
                  <div className="text-xs">
                    <div className="text-rose-400 mb-1">Errors</div>
                    <div className="text-rose-300 max-h-24 overflow-y-auto custom-scrollbar rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
                      {syncResult.errors.map((err, i) => (
                        <div key={i} className="truncate">{err}</div>
                      ))}
                    </div>
                  </div>
                )}

                {syncResult.uploaded.length === 0 && syncResult.downloaded.length === 0 && syncResult.errors.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-2">No content to sync</div>
                )}

                <Button variant="outline" className="w-full" onClick={onClose}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                {/* WebDAV Status */}
                {!webdavConfig.enabled && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
                    <div className="text-sm text-amber-400">
                      WebDAV is not configured. Check settings first.
                    </div>
                  </div>
                )}

                {/* Sync Preview */}
                {hasItems ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 mb-4">
                    <div className="text-xs text-slate-400 mb-2">The following content will be synced:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {syncItems.map((item, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 text-sm mb-4">
                    No content selected for sync, please check settings
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => handleSync('upload')}
                    disabled={syncing || !hasItems || !webdavConfig.enabled}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {syncing && syncDirection === 'upload' ? 'Uploading...' : 'Upload'}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleSync('download')}
                    disabled={syncing || !hasItems || !webdavConfig.enabled}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    {syncing && syncDirection === 'download' ? 'Downloading...' : 'Download'}
                  </Button>
                </div>

                <p className="text-xs text-slate-500 text-center mt-3">
                  Upload will overwrite cloud, download will overwrite local
                </p>
              </>
            )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
