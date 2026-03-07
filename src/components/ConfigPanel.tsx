import { commands } from '../lib/commands';
import { TextDocumentPanel } from './content/TextDocumentPanel';
import { useTextDocumentEditor } from '../hooks/useTextDocumentEditor';

interface ConfigPanelProps {
  onBack: () => void;
}

export function ConfigPanel({ onBack }: ConfigPanelProps) {
  const editor = useTextDocumentEditor({
    load: commands.readConfigToml,
    save: commands.saveConfigToml,
    saveTitle: 'config.toml',
  });

  const highlightToml = (code: string) => {
    return code.split('\n').map((line, i) => {
      const trimmed = line.trim();
      let className = 'text-slate-300';

      if (trimmed.startsWith('#')) {
        className = 'text-slate-500';
      } else if (trimmed.startsWith('[')) {
        className = 'text-primary-400 font-medium';
      } else if (trimmed.includes('=')) {
        const [key, ...rest] = line.split('=');
        return (
          <div key={i} className="leading-relaxed">
            <span className="text-blue-400">{key}</span>
            <span className="text-slate-500">=</span>
            <span className="text-amber-300">{rest.join('=')}</span>
          </div>
        );
      }

      return <div key={i} className={`leading-relaxed ${className}`}>{line || ' '}</div>;
    });
  };

  return (
    <TextDocumentPanel
      title="config.toml"
      onBack={onBack}
      content={editor.content}
      editContent={editor.editContent}
      loading={editor.loading}
      isEditing={editor.isEditing}
      saving={editor.saving}
      emptyStateTitle="config.toml file does not exist"
      emptyStateIconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      editorPlaceholder="# Code Revolver configuration&#10;model = &quot;o3&quot;&#10;&#10;[mcp_servers.example]&#10;command = &quot;...&quot;"
      renderReadOnly={(content) => (
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 font-mono text-sm">
          {highlightToml(content)}
        </div>
      )}
      onEditContentChange={editor.setEditContent}
      onStartEditing={() => editor.setIsEditing(true)}
      onCancelEditing={editor.cancelEditing}
      onSave={editor.handleSave}
    />
  );
}
