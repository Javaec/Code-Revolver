import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccounts } from '../hooks/useAccounts';
import { Button, Card, Input } from './ui';

interface AddAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
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

export function AddAccountDialog({ isOpen, onClose }: AddAccountDialogProps) {
  const { addAccount } = useAccounts();
  const [name, setName] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!jsonContent.trim()) {
      setError('Please paste auth.json content');
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
    const result = await addAccount(name, jsonContent);
    if (result.success) {
      // Add a slight delay to ensure UI refreshes correctly
      await new Promise(resolve => setTimeout(resolve, 500));
      onClose();
      setName('');
      setJsonContent('');
    } else {
      setError(result.message || 'Failed to add account');
    }
    setLoading(false);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setJsonContent(text);
        setError('');
      }
    } catch {
      setError('Could not read clipboard');
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
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial="hidden" animate="visible" exit="hidden">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" variants={overlayVariants} onClick={handleClose} />
          <motion.div variants={dialogVariants} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="relative w-full max-w-lg">
            <Card className="p-6 border-white/20 bg-white/15 backdrop-blur-[20px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gradient">Add Account</h3>
                <Button onClick={handleClose} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Account Name (Optional)</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="If left blank, email will be extracted from token" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-400">auth.json Content</label>
                    <Button onClick={handlePaste} variant="ghost" size="sm" className="h-7 px-2 text-primary-400 hover:text-primary-300">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Paste from Clipboard
                    </Button>
                  </div>
                  <textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} rows={8} placeholder='{"openai_api_key": null, "tokens": {...}}' className="w-full resize-none rounded-md border border-white/15 bg-slate-950/60 p-3 font-mono text-xs text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60" />
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
                <Button variant="default" onClick={handleSave} disabled={loading || !jsonContent.trim()}>{loading ? 'Saving...' : 'Add'}</Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
