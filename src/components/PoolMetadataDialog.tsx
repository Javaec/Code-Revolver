import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AccountInfo, AccountPoolMetadata } from '../types';
import { Button, Card, Input } from './ui';

interface PoolMetadataDialogProps {
  isOpen: boolean;
  account: AccountInfo | null;
  onClose: () => void;
  onSave: (accountId: string, metadata: AccountPoolMetadata) => void;
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

export function PoolMetadataDialog({ isOpen, account, onClose, onSave }: PoolMetadataDialogProps) {
  const [priority, setPriority] = useState(account?.pool?.priority ?? 5);

  const handleSave = () => {
    if (!account) return;
    onSave(account.id, {
      priority: Math.max(1, Math.min(10, Math.round(priority || 5))),
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && account && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial="hidden" animate="visible" exit="hidden">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" variants={overlayVariants} onClick={onClose} />
          <motion.div variants={dialogVariants} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="relative w-full max-w-md">
            <Card className="p-5 border-cyan-500/25 bg-slate-900/85">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-cyan-300">Switch Priority - {account.name}</h3>
                <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <p className="text-xs text-slate-400 mb-4">
                Set a priority from 1 to 10. Higher priority is preferred during auto-switch.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input
                    type="range"
                    min={1}
                    max={10}
                    value={priority}
                    onChange={(e) => setPriority(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                    className="h-8"
                  />
                  <div className="min-w-10 text-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm py-1">
                    {priority}
                  </div>
                </div>
                <div className="flex gap-2">
                  {[3, 5, 8].map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPriority(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-slate-500">
                  3 = backup, 5 = normal, 8 = preferred
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button variant="default" onClick={handleSave}>Save Metadata</Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
