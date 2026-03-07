import { startTransition, useCallback, useEffect, useState } from 'react';
import { PromptInfo } from '../types';
import { confirmAction } from '../lib/dialogs';
import { commands } from '../lib/commands';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';

export function usePromptsManager() {
  const { notifyError, notifySuccess } = useNotifications();
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');
  const isDirty = isEditing && selectedPrompt !== null && editContent !== selectedPrompt.content;

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await commands.scanPrompts();
      startTransition(() => {
        setPrompts(result);
      });
    } catch (error) {
      notifyError(toErrorMessage(error), 'Load Prompts');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const confirmDiscardChanges = useCallback(async () => {
    if (!isDirty) {
      return true;
    }
    return await confirmAction('Discard unsaved prompt changes?', 'Unsaved Changes');
  }, [isDirty]);

  const handleSelect = useCallback(async (prompt: PromptInfo) => {
    if (selectedPrompt?.filePath === prompt.filePath) {
      return;
    }
    if (!await confirmDiscardChanges()) {
      return;
    }
    startTransition(() => {
      setSelectedPrompt(prompt);
      setEditContent(prompt.content);
      setIsEditing(false);
    });
  }, [confirmDiscardChanges, selectedPrompt?.filePath]);

  const handleSave = useCallback(async () => {
    if (!selectedPrompt) return;
    try {
      await commands.savePromptContent(selectedPrompt.filePath, editContent);
      await loadPrompts();
      setIsEditing(false);
      notifySuccess(`Saved "${selectedPrompt.name}"`, 'Prompts');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Save Prompt');
    }
  }, [editContent, loadPrompts, notifyError, notifySuccess, selectedPrompt]);

  const handleDelete = useCallback(async (prompt: PromptInfo) => {
    if (!await confirmAction(`Delete prompt "${prompt.name}"?`, 'Delete Prompt')) return;
    try {
      await commands.deletePrompt(prompt.filePath);
      if (selectedPrompt?.filePath === prompt.filePath) {
        setSelectedPrompt(null);
      }
      await loadPrompts();
      notifySuccess(`Deleted "${prompt.name}"`, 'Prompts');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Delete Prompt');
    }
  }, [loadPrompts, notifyError, notifySuccess, selectedPrompt]);

  const closeCreateDialog = useCallback(() => {
    setIsCreating(false);
    setNewName('');
    setNewDescription('');
    setNewContent('');
  }, []);

  const closeCreateDialogWithConfirm = useCallback(async () => {
    if (!newName.trim() && !newDescription.trim() && !newContent.trim()) {
      closeCreateDialog();
      return;
    }
    if (await confirmAction('Discard new prompt draft?', 'Discard Draft')) {
      closeCreateDialog();
    }
  }, [closeCreateDialog, newContent, newDescription, newName]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const cancelEditing = useCallback(async () => {
    if (!await confirmDiscardChanges()) {
      return;
    }
    if (selectedPrompt) {
      setEditContent(selectedPrompt.content);
    }
    setIsEditing(false);
  }, [confirmDiscardChanges, selectedPrompt]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await commands.createPrompt(
        newName.trim(),
        newDescription.trim(),
        newContent.trim() || `# ${newName.trim()}`,
      );
      closeCreateDialog();
      await loadPrompts();
      notifySuccess(`Created "${newName.trim()}"`, 'Prompts');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Create Prompt');
    }
  }, [closeCreateDialog, loadPrompts, newContent, newDescription, newName, notifyError, notifySuccess]);

  return {
    prompts,
    loading,
    selectedPrompt,
    editContent,
    isEditing,
    isDirty,
    isCreating,
    newName,
    newDescription,
    newContent,
    setEditContent,
    setIsEditing: startEditing,
    setIsCreating,
    setNewName,
    setNewDescription,
    setNewContent,
    handleSelect,
    handleSave,
    handleDelete,
    handleCreate,
    closeCreateDialog: closeCreateDialogWithConfirm,
    cancelEditing,
    confirmDiscardChanges,
  };
}
