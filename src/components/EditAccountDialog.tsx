import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { AccountInfo } from '../types';
import { Button, Card } from './ui';

interface EditAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  account: AccountInfo | null;
  onSave: () => void;
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

export function EditAccountDialog({ isOpen, onClose, account, onSave }: EditAccountDialogProps) {
  const [jsonContent, setJsonContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadContent = useCallback(async () => {
    if (!account) return;
    setLoadingContent(true);
    setError('');
    try {
      const content = await invoke<string>('read_account_content', { filePath: account.filePath });
      setJsonContent(content);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoadingContent(false);
    }
  }, [account]);

  useEffect(() => {
    if (isOpen && account) {
      loadContent();
    }
  }, [isOpen, account, loadContent]);

  const handleSave = async () => {
    if (!account || !jsonContent.trim()) {
      setError('Content cannot be empty');
      return;
    }
    try {
      JSON.parse(jsonContent);
    } catch {
      setError('Invalid JSON format');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await invoke('update_account_content', { filePath: account.filePath, content: jsonContent });
      // Add a slight delay to ensure UI refreshes correctly
      await new Promise(resolve => setTimeout(resolve, 500));
      onSave();
      onClose();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed');
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setError('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && account && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial="hidden" animate="visible" exit="hidden">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" variants={overlayVariants} onClick={handleClose} />
          <motion.div variants={dialogVariants} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="relative w-full max-w-lg">
            <Card className="p-6 border-white/20 bg-white/15 backdrop-blur-[20px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gradient">Edit Account - {account.name}</h3>
                <Button onClick={handleClose} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-400">auth.json Content</label>
                    <Button onClick={handleCopy} variant="ghost" size="sm" className="h-7 px-2 text-primary-400 hover:text-primary-300">
                      {copied ? (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  {loadingContent ? (
                    <div className="w-full h-[240px] rounded-xl border border-white/15 bg-white/5 flex items-center justify-center">
                      <svg className="animate-spin h-6 w-6 text-primary-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : (
                    <textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} rows={10} className="w-full resize-none rounded-md border border-white/15 bg-slate-950/60 p-3 font-mono text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60" />
                  )}
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2">
                    <svg className="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-rose-300">{error}</span>
                  </motion.div>
                )}
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
                <Button variant="default" onClick={handleSave} disabled={loading || loadingContent || !jsonContent.trim()}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
