import { startTransition, useCallback, useEffect, useState } from 'react';
import { SkillInfo } from '../types';
import { confirmAction } from '../lib/dialogs';
import { commands } from '../lib/commands';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';

export function useSkillsManager() {
  const { notifyError, notifySuccess } = useNotifications();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const result = await commands.scanSkills();
      startTransition(() => {
        setSkills(result);
      });
    } catch (error) {
      notifyError(toErrorMessage(error), 'Load Skills');
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleSelect = useCallback(async (skill: SkillInfo) => {
    startTransition(() => {
      setSelectedSkill(skill);
      setIsEditing(false);
    });
    try {
      const content = await commands.readSkillContent(skill.dirPath);
      setEditContent(content);
    } catch (error) {
      setEditContent('');
      notifyError(toErrorMessage(error), 'Read Skill');
    }
  }, [notifyError]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill) return;
    try {
      await commands.saveSkillContent(selectedSkill.dirPath, editContent);
      await loadSkills();
      setIsEditing(false);
      notifySuccess(`Saved "${selectedSkill.name}"`, 'Skills');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Save Skill');
    }
  }, [editContent, loadSkills, notifyError, notifySuccess, selectedSkill]);

  const handleDelete = useCallback(async (skill: SkillInfo) => {
    if (!await confirmAction(`Delete skill "${skill.name}" and its entire directory?`, 'Delete Skill')) return;
    try {
      await commands.deleteSkill(skill.dirPath);
      if (selectedSkill?.dirPath === skill.dirPath) {
        setSelectedSkill(null);
      }
      await loadSkills();
      notifySuccess(`Deleted "${skill.name}"`, 'Skills');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Delete Skill');
    }
  }, [loadSkills, notifyError, notifySuccess, selectedSkill]);

  const closeCreateDialog = useCallback(() => {
    setIsCreating(false);
    setNewName('');
    setNewDescription('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await commands.createSkill(
        newName.trim().toLowerCase().replace(/\s+/g, '-'),
        newDescription.trim(),
      );
      closeCreateDialog();
      await loadSkills();
      notifySuccess(`Created "${newName.trim()}"`, 'Skills');
    } catch (error) {
      notifyError(toErrorMessage(error), 'Create Skill');
    }
  }, [closeCreateDialog, loadSkills, newDescription, newName, notifyError, notifySuccess]);

  const handleCancelEdit = useCallback(async () => {
    if (!selectedSkill) return;
    const content = await commands.readSkillContent(selectedSkill.dirPath);
    setEditContent(content);
    setIsEditing(false);
  }, [selectedSkill]);

  return {
    skills,
    loading,
    selectedSkill,
    editContent,
    isEditing,
    isCreating,
    newName,
    newDescription,
    setEditContent,
    setIsEditing,
    setIsCreating,
    setNewName,
    setNewDescription,
    handleSelect,
    handleSave,
    handleDelete,
    handleCreate,
    closeCreateDialog,
    handleCancelEdit,
  };
}
