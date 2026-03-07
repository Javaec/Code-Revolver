import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Input } from '../ui';

interface SkillCreateDialogProps {
  isOpen: boolean;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function SkillCreateDialog({
  isOpen,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onCreate,
  onClose,
}: SkillCreateDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md mx-4"
          >
            <Card className="p-6 border-white/20 bg-white/15 backdrop-blur-[20px]">
              <h3 className="text-lg font-bold text-gradient mb-4">New Skill</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="Example: my-awesome-skill"
                  />
                  <p className="text-xs text-slate-500 mt-1">Will be automatically converted to lowercase and hyphenated</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    placeholder="Describe the purpose of this skill..."
                    rows={3}
                    className="w-full resize-none rounded-md border border-white/15 bg-slate-950/60 p-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="default" onClick={onCreate}>
                  Create
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
