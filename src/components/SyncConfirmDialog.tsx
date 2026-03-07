import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WebDavConfig, SyncSettings, SyncResult, SyncPreview, DEFAULT_SYNC_SETTINGS } from '../types';
import { Button, Card } from './ui';
import { resolveWebDavRequestConfig, validateWebDavConfig } from '../lib/webdav';
import { commands } from '../lib/commands';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';
import { appendSyncHistory, getEnabledSyncItems, loadSyncHistory, SyncHistoryEntry } from '../lib/syncHistory';

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
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>(() => loadSyncHistory());
  const { notifyError } = useNotifications();

  const sync = syncSettings || DEFAULT_SYNC_SETTINGS;

  // Reset state
  useEffect(() => {
    if (isOpen) {
      setSyncResult(null);
      setSyncDirection(null);
      setPreview(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const validationError = validateWebDavConfig(webdavConfig);
    if (validationError) {
      setPreview(null);
      return;
    }

    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const config = await resolveWebDavRequestConfig(webdavConfig);
        const syncConfig = {
          syncPrompts: sync.syncPrompts,
          syncSkills: sync.syncSkills,
          syncAgentsMd: sync.syncAgentsMd,
          syncConfigToml: sync.syncConfigToml,
        };
        const nextPreview = await commands.previewSync(config, syncConfig, sync.syncAccounts);
        setPreview(nextPreview);
      } catch (error) {
        setPreview(null);
        notifyError(toErrorMessage(error), 'Sync Preview');
      } finally {
        setPreviewLoading(false);
      }
    };

    void loadPreview();
  }, [isOpen, notifyError, sync.syncAccounts, sync.syncAgentsMd, sync.syncConfigToml, sync.syncPrompts, sync.syncSkills, webdavConfig]);

  const handleSync = async (direction: 'upload' | 'download') => {
    const validationError = validateWebDavConfig(webdavConfig);
    if (validationError) {
      setSyncResult({
        uploaded: [],
        downloaded: [],
        errors: [validationError],
      });
      return;
    }

    setSyncing(true);
    setSyncDirection(direction);
    setSyncResult(null);

    try {
      const config = await resolveWebDavRequestConfig(webdavConfig);

      const syncConfig = {
        syncPrompts: sync.syncPrompts,
        syncSkills: sync.syncSkills,
        syncAgentsMd: sync.syncAgentsMd,
        syncConfigToml: sync.syncConfigToml,
      };

      const result: SyncResult = { uploaded: [], downloaded: [], errors: [] };

      if (direction === 'upload') {
        // Upload Codex config
        const codexResult = await commands.syncCodexUpload(config, syncConfig);
        result.uploaded.push(...codexResult.uploaded);
        result.errors.push(...codexResult.errors);

        // Upload account files
        if (sync.syncAccounts) {
          const accountResult = await commands.syncAccountsUpload(config);
          result.uploaded.push(...accountResult.uploaded.map(f => `Account: ${f}`));
          result.errors.push(...accountResult.errors);
        }
      } else {
        // Download Codex config
        const codexResult = await commands.syncCodexDownload(config, syncConfig);
        result.downloaded.push(...codexResult.downloaded);
        result.errors.push(...codexResult.errors);

        // Download account files
        if (sync.syncAccounts) {
          const accountResult = await commands.syncAccountsDownload(config);
          result.downloaded.push(...accountResult.downloaded.map(f => `Account: ${f}`));
          result.errors.push(...accountResult.errors);
        }
      }

      setSyncResult(result);

      // Update last sync time
      if (result.errors.length === 0 || result.uploaded.length > 0 || result.downloaded.length > 0) {
        onSyncComplete(Date.now());
        setSyncHistory(appendSyncHistory(direction, sync, result, preview));
      }
    } catch (error) {
      setSyncResult({
        uploaded: [],
        downloaded: [],
        errors: [toErrorMessage(error)],
      });
    } finally {
      setSyncing(false);
      setSyncDirection(null);
    }
  };

  const syncItems = getEnabledSyncItems(sync);
  const hasItems = syncItems.length > 0;
  const isSuccess = syncResult && syncResult.errors.length === 0;
  const conflictCount = preview?.conflictCount ?? 0;

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
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-xs text-slate-400">Preview before overwrite</div>
                      {preview && (
                        <div className="text-[11px] text-slate-400">
                          {preview.uploadCount} upload • {preview.downloadCount} download • {preview.conflictCount} conflict
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {syncItems.map((item, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                          {item}
                        </span>
                      ))}
                    </div>
                    {previewLoading ? (
                      <div className="text-xs text-slate-500">Building sync preview...</div>
                    ) : preview ? (
                      <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-black/10 p-2 text-xs">
                        {preview.items.length === 0 ? (
                          <div className="text-slate-500">No remote or local files found for the selected scopes.</div>
                        ) : (
                          preview.items.map((item) => (
                            <div key={`${item.type}:${item.name}`} className="flex items-center justify-between gap-2 py-1">
                              <div className="min-w-0 truncate text-slate-200">{item.name}</div>
                              <span
                                className={`shrink-0 rounded-md border px-2 py-0.5 uppercase tracking-wide ${
                                  item.action === 'conflict'
                                    ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                                    : item.action === 'upload'
                                      ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                                      : item.action === 'download'
                                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                        : 'border-white/10 bg-white/5 text-slate-400'
                                }`}
                              >
                                {item.action}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">Preview unavailable for the current configuration.</div>
                    )}
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
                    disabled={syncing || previewLoading || !hasItems || !webdavConfig.enabled}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {syncing && syncDirection === 'upload' ? 'Uploading...' : conflictCount > 0 ? `Upload (${conflictCount} overwrite)` : 'Upload'}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleSync('download')}
                    disabled={syncing || previewLoading || !hasItems || !webdavConfig.enabled}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    {syncing && syncDirection === 'download' ? 'Downloading...' : conflictCount > 0 ? `Download (${conflictCount} overwrite)` : 'Download'}
                  </Button>
                </div>

                <p className="text-xs text-slate-500 text-center mt-3">
                  Conflicts are detected up front. Upload overwrites cloud, download overwrites local.
                </p>

                {syncHistory.length > 0 && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Recent Sync History</div>
                    <div className="max-h-36 space-y-2 overflow-y-auto custom-scrollbar">
                      {syncHistory.slice(0, 5).map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-slate-200">
                              {entry.direction === 'upload' ? 'Upload' : 'Download'} • {entry.syncItems.join(', ')}
                            </div>
                            <div className="text-slate-500">
                              {new Date(entry.happenedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="mt-1 text-slate-400">
                            {entry.uploadedCount} uploaded • {entry.downloadedCount} downloaded • {entry.errorCount} errors • {entry.conflictCount} conflicts
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
