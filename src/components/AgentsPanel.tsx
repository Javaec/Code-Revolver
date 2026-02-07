import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, Card } from './ui';

interface AgentsPanelProps {
  onBack: () => void;
}

export function AgentsPanel({ onBack }: AgentsPanelProps) {
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadContent = async () => {
    setLoading(true);
    try {
      const result = await invoke<string>('read_agents_md');
      setContent(result);
      setEditContent(result);
    } catch (error) {
      console.error('Failed to load AGENTS.MD:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_agents_md', { content: editContent });
      setContent(editContent);
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      alert(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h2 className="text-lg font-bold text-gradient">AGENTS.MD</h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditContent(content);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="flex-1 overflow-hidden flex flex-col min-h-0 p-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading...
          </div>
        ) : content === '' && !isEditing ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm mb-3">AGENTS.MD file does not exist</p>
              <Button variant="default" size="sm" onClick={() => setIsEditing(true)}>
                Create File
              </Button>
            </motion.div>
          </div>
        ) : isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="flex-1 w-full bg-transparent p-4 text-sm font-mono text-slate-300 resize-none focus:outline-none custom-scrollbar"
            placeholder="# AGENTS.MD&#10;&#10;Write system prompts here..."
          />
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 prose prose-invert prose-sm max-w-none prose-headings:text-slate-200 prose-headings:font-semibold prose-p:text-slate-400 prose-p:leading-relaxed prose-li:text-slate-400 prose-strong:text-slate-200 prose-code:text-slate-300 prose-code:bg-slate-700/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-pre:bg-slate-900/50 prose-pre:border prose-pre:border-slate-700/50 prose-pre:text-slate-400 prose-a:text-primary-400 prose-blockquote:border-slate-600 prose-blockquote:text-slate-500 prose-hr:border-slate-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </Card>
    </div>
  );
}
