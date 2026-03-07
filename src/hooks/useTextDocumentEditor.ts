import { useCallback, useEffect, useState } from 'react';
import { showError } from '../lib/dialogs';

interface TextDocumentEditorOptions {
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  saveTitle: string;
}

export function useTextDocumentEditor({ load, save, saveTitle }: TextDocumentEditorOptions) {
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const result = await load();
      setContent(result);
      setEditContent(result);
    } catch (error) {
      console.error(`Failed to load ${saveTitle}:`, error);
      await showError(error, `Load ${saveTitle}`);
    } finally {
      setLoading(false);
    }
  }, [load, saveTitle]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await save(editContent);
      setContent(editContent);
      setIsEditing(false);
    } catch (error) {
      console.error(`Save failed for ${saveTitle}:`, error);
      await showError(error, `Save ${saveTitle}`);
    } finally {
      setSaving(false);
    }
  }, [editContent, save, saveTitle]);

  const cancelEditing = useCallback(() => {
    setEditContent(content);
    setIsEditing(false);
  }, [content]);

  return {
    content,
    editContent,
    loading,
    isEditing,
    saving,
    setEditContent,
    setIsEditing,
    handleSave,
    cancelEditing,
  };
}
