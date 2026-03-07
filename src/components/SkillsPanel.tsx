import { useDeferredValue, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Input } from './ui';
import { SkillCreateDialog } from './skills/SkillCreateDialog';
import { MarkdownDocumentView } from './content/MarkdownDocumentView';
import { useSkillsManager } from '../hooks/useSkillsManager';
import { useListKeyboardNavigation } from '../hooks/useListKeyboardNavigation';
import { WorkspaceSplitView } from './content/WorkspaceSplitView';

interface SkillsPanelProps {
  onBack: () => void;
}

const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};

export function SkillsPanel({ onBack }: SkillsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
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
    confirmDiscardChanges,
    isDirty,
  } = useSkillsManager();

  const visibleSkills = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter((skill) => (
      skill.name.toLowerCase().includes(query)
      || skill.description.toLowerCase().includes(query)
      || skill.dirPath.toLowerCase().includes(query)
    ));
  }, [deferredSearchQuery, skills]);

  const { handleKeyDown, setFocusedIndex } = useListKeyboardNavigation({
    items: visibleSkills,
    selectedKey: selectedSkill?.dirPath ?? null,
    getKey: (skill) => skill.dirPath,
    onSelect: handleSelect,
    onDelete: handleDelete,
  });

  const handleBack = async () => {
    if (await confirmDiscardChanges()) {
      onBack();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => void handleBack()}>
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

      <WorkspaceSplitView
        listHeader={
          <>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Skills</div>
            <div className="mt-1 text-xs text-slate-400">
              {selectedSkill ? `Selected: ${selectedSkill.name}` : `${visibleSkills.length} skill folders`}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">Use arrow keys to move, Enter to open, Delete to remove.</div>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search skills..."
              className="mt-3 h-8 text-xs"
            />
          </>
        }
        listBody={
          <div
            className="space-y-1 outline-none"
            role="listbox"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-label="Skill list"
          >
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
            ) : visibleSkills.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No matching skills</div>
            ) : (
              <AnimatePresence>
                {visibleSkills.map((skill, index) => (
                  <motion.div
                    key={skill.dirPath}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: index * 0.03 }}
                    className={`group relative rounded-2xl border p-3 transition-all ${
                      selectedSkill?.dirPath === skill.dirPath
                        ? 'cursor-default border-primary-400/35 bg-gradient-to-r from-primary-500/25 via-primary-500/10 to-transparent text-white shadow-lg shadow-primary-950/20'
                        : 'cursor-pointer border-transparent text-slate-300 hover:border-white/10 hover:bg-white/10'
                    }`}
                    role="option"
                    aria-selected={selectedSkill?.dirPath === skill.dirPath}
                    onMouseEnter={() => setFocusedIndex(index)}
                    onClick={() => void handleSelect(skill)}
                  >
                    <div className={`absolute inset-y-2 left-0 w-1 rounded-full ${selectedSkill?.dirPath === skill.dirPath ? 'bg-primary-400' : 'bg-transparent'}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate">{skill.name}</h3>
                          {selectedSkill?.dirPath === skill.dirPath && (
                            <span className="rounded-full border border-primary-300/25 bg-primary-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary-100">
                              Selected
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <p className={`mt-1 line-clamp-2 text-xs ${selectedSkill?.dirPath === skill.dirPath ? 'text-slate-200/80' : 'text-slate-500'}`}>
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
                        <div className="mt-1 text-[11px] text-slate-500">
                          {skill.dirPath.split('\\').pop() || skill.dirPath.split('/').pop()}
                        </div>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(skill);
                        }}
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${selectedSkill?.dirPath === skill.dirPath ? 'text-slate-300/80 hover:text-rose-300' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-400'}`}
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
        }
        detailHeader={
          selectedSkill ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Skill Focus</div>
                <h3 className="truncate font-medium text-white">{selectedSkill.name}</h3>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isEditing ? 'border-amber-400/30 bg-amber-500/15 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
                  {isEditing ? (isDirty ? 'Editing' : 'Editing Clean') : 'Viewing'}
                </span>
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
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing()}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Skill Focus</div>
              <div className="text-sm font-medium text-white">SKILL.md Preview</div>
            </div>
          )
        }
        detailBody={
          selectedSkill ? (
            isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 w-full resize-none bg-transparent p-4 text-sm font-mono text-slate-300 focus:outline-none custom-scrollbar"
              />
            ) : (
              <MarkdownDocumentView content={editContent} stripFrontmatter />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-slate-600">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                <svg className="mx-auto mb-3 h-12 w-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p className="text-sm">Select a skill from the left list to open its `SKILL.md`.</p>
              </motion.div>
            </div>
          )
        }
      />

      <SkillCreateDialog
        isOpen={isCreating}
        name={newName}
        description={newDescription}
        onNameChange={setNewName}
        onDescriptionChange={setNewDescription}
        onCreate={() => void handleCreate()}
        onClose={() => void closeCreateDialog()}
      />
    </div>
  );
}
