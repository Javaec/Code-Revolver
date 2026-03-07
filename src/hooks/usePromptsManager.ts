import { startTransition, useCallback, useEffect, useState } from 'react';
import { PromptInfo } from '../types';
import { confirmAction, showError } from '../lib/dialogs';
import { commands } from '../lib/commands';

export function usePromptsManager() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await commands.scanPrompts();
      startTransition(() => {
        setPrompts(result);
      });
    } catch (error) {
      console.error('Failed to load prompts:', error);
      await showError(error, 'Load Prompts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const handleSelect = useCallback((prompt: PromptInfo) => {
    startTransition(() => {
      setSelectedPrompt(prompt);
      setEditContent(prompt.content);
      setIsEditing(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedPrompt) return;
    try {
      await commands.savePromptContent(selectedPrompt.filePath, editContent);
      await loadPrompts();
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      await showError(error, 'Save Prompt');
    }
  }, [editContent, loadPrompts, selectedPrompt]);

  const handleDelete = useCallback(async (prompt: PromptInfo) => {
    if (!await confirmAction(`Delete prompt "${prompt.name}"?`, 'Delete Prompt')) return;
    try {
      await commands.deletePrompt(prompt.filePath);
      if (selectedPrompt?.filePath === prompt.filePath) {
        setSelectedPrompt(null);
      }
      await loadPrompts();
    } catch (error) {
      console.error('Delete failed:', error);
      await showError(error, 'Delete Prompt');
    }
  }, [loadPrompts, selectedPrompt]);

  const closeCreateDialog = useCallback(() => {
    setIsCreating(false);
    setNewName('');
    setNewDescription('');
    setNewContent('');
  }, []);

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
    } catch (error) {
      console.error('Create failed:', error);
      await showError(error, 'Create Prompt');
    }
  }, [closeCreateDialog, loadPrompts, newContent, newDescription, newName]);

  return {
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
  };
}
