import { useCallback, useEffect, useState } from 'react';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';

interface TextDocumentEditorOptions {
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  saveTitle: string;
}

export function useTextDocumentEditor({ load, save, saveTitle }: TextDocumentEditorOptions) {
  const { notifyError, notifySuccess } = useNotifications();
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
      notifyError(toErrorMessage(error), `Load ${saveTitle}`);
    } finally {
      setLoading(false);
    }
  }, [load, notifyError, saveTitle]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await save(editContent);
      setContent(editContent);
      setIsEditing(false);
      notifySuccess(`${saveTitle} saved`, saveTitle);
    } catch (error) {
      notifyError(toErrorMessage(error), `Save ${saveTitle}`);
    } finally {
      setSaving(false);
    }
  }, [editContent, notifyError, notifySuccess, save, saveTitle]);

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
