import { commands } from '../lib/commands';
import { TextDocumentPanel } from './content/TextDocumentPanel';
import { useTextDocumentEditor } from '../hooks/useTextDocumentEditor';

interface AgentsPanelProps {
  onBack: () => void;
}

export function AgentsPanel({ onBack }: AgentsPanelProps) {
  const editor = useTextDocumentEditor({
    load: commands.readAgentsMd,
    save: commands.saveAgentsMd,
    saveTitle: 'AGENTS.MD',
  });

  return (
    <TextDocumentPanel
      title="AGENTS.MD"
      onBack={onBack}
      content={editor.content}
      editContent={editor.editContent}
      loading={editor.loading}
      isEditing={editor.isEditing}
      saving={editor.saving}
      emptyStateTitle="AGENTS.MD file does not exist"
      emptyStateIconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      editorPlaceholder="# AGENTS.MD&#10;&#10;Write system prompts here..."
      useMarkdownPreview
      onEditContentChange={editor.setEditContent}
      onStartEditing={() => editor.setIsEditing(true)}
      onCancelEditing={editor.cancelEditing}
      onSave={editor.handleSave}
    />
  );
}
