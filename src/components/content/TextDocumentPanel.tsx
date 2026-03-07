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
  emptyStateTitle: string;
  emptyStateIconPath: string;
  editorPlaceholder: string;
  useMarkdownPreview?: boolean;
  renderReadOnly?: (content: string) => ReactNode;
  onEditContentChange: (value: string) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void | Promise<void>;
}

export function TextDocumentPanel({
  title,
  onBack,
  content,
  editContent,
  loading,
  isEditing,
  saving,
  emptyStateTitle,
  emptyStateIconPath,
  editorPlaceholder,
  useMarkdownPreview = false,
  renderReadOnly,
  onEditContentChange,
  onStartEditing,
  onCancelEditing,
  onSave,
}: TextDocumentPanelProps) {
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
              <Button variant="ghost" size="sm" onClick={onCancelEditing}>
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

      <Card className="flex-1 overflow-hidden flex flex-col min-h-0 p-0">
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
            className="flex-1 w-full bg-transparent p-4 text-sm font-mono text-slate-300 resize-none focus:outline-none custom-scrollbar"
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
