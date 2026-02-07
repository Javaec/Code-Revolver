import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { Button, Card } from './ui';

interface ConfigPanelProps {
  onBack: () => void;
}

export function ConfigPanel({ onBack }: ConfigPanelProps) {
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadContent = async () => {
    setLoading(true);
    try {
      const result = await invoke<string>('read_config_toml');
      setContent(result);
      setEditContent(result);
    } catch (error) {
      console.error('Failed to load config.toml:', error);
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
      await invoke('save_config_toml', { content: editContent });
      setContent(editContent);
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      alert(String(error));
    } finally {
      setSaving(false);
    }
  };

  // Simple TOML syntax highlighting
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h2 className="text-lg font-bold text-gradient">config.toml</h2>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm mb-3">config.toml file does not exist</p>
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
            placeholder="# Code Revolver configuration&#10;model = &quot;o3&quot;&#10;&#10;[mcp_servers.example]&#10;command = &quot;...&quot;"
          />
        ) : (
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 font-mono text-sm">
            {highlightToml(content)}
          </div>
        )}
      </Card>
    </div>
  );
}
