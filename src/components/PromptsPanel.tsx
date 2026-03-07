import { useDeferredValue, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Input } from './ui';
import { PromptCreateDialog } from './prompts/PromptCreateDialog';
import { MarkdownDocumentView } from './content/MarkdownDocumentView';
import { usePromptsManager } from '../hooks/usePromptsManager';
import { useListKeyboardNavigation } from '../hooks/useListKeyboardNavigation';
import { WorkspaceSplitView } from './content/WorkspaceSplitView';

interface PromptsPanelProps {
  onBack: () => void;
}

const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};

export function PromptsPanel({ onBack }: PromptsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const {
    prompts,
    loading,
    selectedPrompt,
    editContent,
    isEditing,
    isCreating,
    newName,
    newDescription,
    newContent,
    setEditContent,
    setIsEditing,
    setIsCreating,
    setNewName,
    setNewDescription,
    setNewContent,
    handleSelect,
    handleSave,
    handleDelete,
    handleCreate,
    closeCreateDialog,
    cancelEditing,
    confirmDiscardChanges,
    isDirty,
  } = usePromptsManager();

  const visiblePrompts = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return prompts;
    return prompts.filter((prompt) => (
      prompt.name.toLowerCase().includes(query)
      || prompt.description.toLowerCase().includes(query)
      || prompt.content.toLowerCase().includes(query)
    ));
  }, [deferredSearchQuery, prompts]);

  const { handleKeyDown, setFocusedIndex } = useListKeyboardNavigation({
    items: visiblePrompts,
    selectedKey: selectedPrompt?.filePath ?? null,
    getKey: (prompt) => prompt.filePath,
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
        <h2 className="text-lg font-bold text-gradient">Prompts Management</h2>
        <Button variant="default" size="sm" onClick={() => setIsCreating(true)}>
          + New
        </Button>
      </div>

      <WorkspaceSplitView
        listHeader={
          <>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Prompts</div>
            <div className="mt-1 text-xs text-slate-400">
              {selectedPrompt ? `Selected: ${selectedPrompt.name}` : `${visiblePrompts.length} prompt files`}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">Use arrow keys to move, Enter to open, Delete to remove.</div>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search prompts..."
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
            aria-label="Prompt list"
          >
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
            ) : visiblePrompts.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No matching prompts</div>
            ) : (
              <AnimatePresence>
                {visiblePrompts.map((prompt, index) => (
                  <motion.div
                    key={prompt.filePath}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: index * 0.03 }}
                    className={`group relative rounded-2xl border p-3 transition-all ${
                      selectedPrompt?.filePath === prompt.filePath
                        ? 'cursor-default border-primary-400/35 bg-gradient-to-r from-primary-500/25 via-primary-500/10 to-transparent text-white shadow-lg shadow-primary-950/20'
                        : 'cursor-pointer border-transparent text-slate-300 hover:border-white/10 hover:bg-white/10'
                    }`}
                    role="option"
                    aria-selected={selectedPrompt?.filePath === prompt.filePath}
                    onMouseEnter={() => setFocusedIndex(index)}
                    onClick={() => void handleSelect(prompt)}
                  >
                    <div className={`absolute inset-y-2 left-0 w-1 rounded-full ${selectedPrompt?.filePath === prompt.filePath ? 'bg-primary-400' : 'bg-transparent'}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate">{prompt.name}</h3>
                          {selectedPrompt?.filePath === prompt.filePath && (
                            <span className="rounded-full border border-primary-300/25 bg-primary-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary-100">
                              Selected
                            </span>
                          )}
                        </div>
                        {prompt.description && (
                          <p className={`mt-1 line-clamp-2 text-xs ${selectedPrompt?.filePath === prompt.filePath ? 'text-slate-200/80' : 'text-slate-500'}`}>
                            {prompt.description}
                          </p>
                        )}
                        <div className="mt-1 text-[11px] text-slate-500">
                          {prompt.filePath.split('\\').pop() || prompt.filePath.split('/').pop()}
                        </div>
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(prompt);
                        }}
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${selectedPrompt?.filePath === prompt.filePath ? 'text-slate-300/80 hover:text-rose-300' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-400'}`}
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
          selectedPrompt ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Document Focus</div>
                <h3 className="truncate font-medium text-white">{selectedPrompt.name}</h3>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isEditing ? 'border-amber-400/30 bg-amber-500/15 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
                  {isEditing ? (isDirty ? 'Editing' : 'Editing Clean') : 'Viewing'}
                </span>
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => void cancelEditing()}>
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Document Focus</div>
              <div className="text-sm font-medium text-white">Prompt Preview</div>
            </div>
          )
        }
        detailBody={
          selectedPrompt ? (
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Select a prompt from the left list to open its preview.</p>
              </motion.div>
            </div>
          )
        }
      />

      <PromptCreateDialog
        isOpen={isCreating}
        name={newName}
        description={newDescription}
        content={newContent}
        onNameChange={setNewName}
        onDescriptionChange={setNewDescription}
        onContentChange={setNewContent}
        onCreate={() => void handleCreate()}
        onClose={() => void closeCreateDialog()}
      />
    </div>
  );
}
