import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card } from './ui';
import { SkillCreateDialog } from './skills/SkillCreateDialog';
import { MarkdownDocumentView } from './content/MarkdownDocumentView';
import { useSkillsManager } from '../hooks/useSkillsManager';

interface SkillsPanelProps {
  onBack: () => void;
}

const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};

export function SkillsPanel({ onBack }: SkillsPanelProps) {
  const {
    skills,
    loading,
    selectedSkill,
    editContent,
    isEditing,
    isCreating,
    newName,
    newDescription,
    setEditContent,
    setIsEditing,
    setIsCreating,
    setNewName,
    setNewDescription,
    handleSelect,
    handleSave,
    handleDelete,
    handleCreate,
    closeCreateDialog,
    handleCancelEdit,
  } = useSkillsManager();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h2 className="text-lg font-bold text-gradient">Skills Management</h2>
        <Button variant="default" size="sm" onClick={() => setIsCreating(true)}>
          + New
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden flex min-h-0 p-0">
        <div className="w-64 flex-shrink-0 border-r border-white/10 flex flex-col">
          <div className="p-3 border-b border-white/10">
            <span className="text-xs text-slate-400 uppercase tracking-wider">List</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
            ) : skills.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No Skills</div>
            ) : (
              <AnimatePresence>
                {skills.map((skill, index) => (
                  <motion.div
                    key={skill.dirPath}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: index * 0.03 }}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all group ${
                      selectedSkill?.dirPath === skill.dirPath
                        ? 'bg-primary-500/20 text-white glow-border'
                        : 'hover:bg-white/10 text-slate-300'
                    }`}
                    onClick={() => void handleSelect(skill)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{skill.name}</h3>
                        {skill.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {skill.hasScripts && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded-md border border-primary-500/30">
                              scripts
                            </span>
                          )}
                          {skill.hasAssets && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                              assets
                            </span>
                          )}
                          {skill.hasReferences && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded-md border border-violet-500/30">
                              refs
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(skill);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selectedSkill ? (
            <>
              <div className="flex items-center justify-between p-3 border-b border-white/10">
                <h3 className="font-medium text-white truncate">{selectedSkill.name}</h3>
                <div className="flex gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => void handleCancelEdit()}>
                        Cancel
                      </Button>
                      <Button variant="default" size="sm" onClick={() => void handleSave()}>
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 w-full bg-transparent p-4 text-sm font-mono text-slate-300 resize-none focus:outline-none custom-scrollbar"
                />
              ) : (
                <MarkdownDocumentView content={editContent} stripFrontmatter />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p className="text-sm">Select a skill to view SKILL.md</p>
              </motion.div>
            </div>
          )}
        </div>
      </Card>

      <SkillCreateDialog
        isOpen={isCreating}
        name={newName}
        description={newDescription}
        onNameChange={setNewName}
        onDescriptionChange={setNewDescription}
        onCreate={() => void handleCreate()}
        onClose={closeCreateDialog}
      />
    </div>
  );
}
