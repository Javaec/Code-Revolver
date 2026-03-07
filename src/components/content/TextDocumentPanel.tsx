import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Button, Card } from '../ui';
import { MarkdownDocumentView } from './MarkdownDocumentView';

interface TextDocumentPanelProps {
  title: string;
  onBack: () => void;
  content: string;
  editContent: string;
  loading: boolean;
  isEditing: boolean;
  saving: boolean;
  isDirty?: boolean;
  autosaveState?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number | null;
  canUndo?: boolean;
  emptyStateTitle: string;
  emptyStateIconPath: string;
  editorPlaceholder: string;
  useMarkdownPreview?: boolean;
  renderReadOnly?: (content: string) => ReactNode;
  onEditContentChange: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onUndo?: () => void;
}

export function TextDocumentPanel({
  title,
  onBack,
  content,
  editContent,
  loading,
  isEditing,
  saving,
  isDirty = false,
  autosaveState = 'idle',
  lastSavedAt = null,
  canUndo = false,
  emptyStateTitle,
  emptyStateIconPath,
  editorPlaceholder,
  useMarkdownPreview = false,
  renderReadOnly,
  onEditContentChange,
  onStartEditing,
  onCancelEditing,
  onSave,
  onUndo,
}: TextDocumentPanelProps) {
  const autosaveLabel = autosaveState === 'saving'
    ? 'Autosaving'
    : autosaveState === 'dirty'
      ? 'Unsaved'
      : autosaveState === 'error'
        ? 'Save Error'
        : lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
          : 'Ready';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h2 className="text-lg font-bold text-gradient">{title}</h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              {onUndo && (
                <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo}>
                  Undo
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => void onCancelEditing()}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={() => void onSave()} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onStartEditing}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <Card className={`flex min-h-0 flex-1 flex-col overflow-hidden p-0 ${isEditing ? 'border-primary-400/25 shadow-lg shadow-primary-950/20' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Document Focus</div>
            <div className="text-sm font-medium text-white">{title}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isEditing ? 'border-amber-400/30 bg-amber-500/15 text-amber-200' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'}`}>
              {isEditing ? 'Editing' : 'Viewing'}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${
              autosaveState === 'error'
                ? 'border-rose-400/30 bg-rose-500/15 text-rose-200'
                : isDirty
                  ? 'border-amber-400/30 bg-amber-500/15 text-amber-200'
                  : 'border-white/10 bg-white/5 text-slate-300'
            }`}>
              {autosaveLabel}
            </span>
          </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">Loading...</div>
        ) : content === '' && !isEditing ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={emptyStateIconPath} />
              </svg>
              <p className="text-sm mb-3">{emptyStateTitle}</p>
              <Button variant="default" size="sm" onClick={onStartEditing}>
                Create File
              </Button>
            </motion.div>
          </div>
        ) : isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            className="flex-1 w-full resize-none bg-transparent p-4 text-sm font-mono text-slate-300 focus:outline-none custom-scrollbar"
            placeholder={editorPlaceholder}
          />
        ) : renderReadOnly ? (
          <>{renderReadOnly(content)}</>
        ) : useMarkdownPreview ? (
          <MarkdownDocumentView content={content} />
        ) : null}
      </Card>
    </div>
  );
}
