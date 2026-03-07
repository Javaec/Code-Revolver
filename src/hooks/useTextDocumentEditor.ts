import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmAction } from '../lib/dialogs';
import { useNotifications } from '../lib/notificationState';
import { toErrorMessage } from '../lib/errors';

interface TextDocumentEditorOptions {
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  saveTitle: string;
  autosaveDelayMs?: number;
}

type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const UNDO_HISTORY_LIMIT = 25;
const SNAPSHOT_MIN_INTERVAL_MS = 900;

export function useTextDocumentEditor({
  load,
  save,
  saveTitle,
  autosaveDelayMs = 1400,
}: TextDocumentEditorOptions) {
  const { notifyError, notifySuccess } = useNotifications();
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const editContentRef = useRef('');
  const contentRef = useRef('');
  const isEditingRef = useRef(false);
  const lastSnapshotAtRef = useRef(0);

  useEffect(() => {
    editContentRef.current = editContent;
  }, [editContent]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const isDirty = useMemo(() => editContent !== content, [content, editContent]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const result = await load();
      setContent(result);
      setEditContent(result);
      setUndoStack([]);
      setAutosaveState('idle');
    } catch (error) {
      notifyError(toErrorMessage(error), `Load ${saveTitle}`);
    } finally {
      setLoading(false);
    }
  }, [load, notifyError, saveTitle]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const runSave = useCallback(async (options?: { exitEditing?: boolean; notify?: boolean; autosave?: boolean }) => {
    const exitEditing = options?.exitEditing ?? true;
    const notify = options?.notify ?? true;

    if (!isDirty && !options?.autosave) {
      if (exitEditing) {
        setIsEditing(false);
      }
      return;
    }

    setSaving(true);
    setAutosaveState('saving');
    try {
      const nextContent = editContentRef.current;
      await save(nextContent);
      setContent(nextContent);
      setUndoStack([]);
      setLastSavedAt(Date.now());
      setAutosaveState('saved');
      if (exitEditing) {
        setIsEditing(false);
      }
      if (notify) {
        notifySuccess(`${saveTitle} saved`, saveTitle);
      }
    } catch (error) {
      setAutosaveState('error');
      notifyError(toErrorMessage(error), `Save ${saveTitle}`);
    } finally {
      setSaving(false);
    }
  }, [isDirty, notifyError, notifySuccess, save, saveTitle]);

  const handleSave = useCallback(async () => {
    await runSave({ exitEditing: true, notify: true });
  }, [runSave]);

  const setDraftContent = useCallback((value: string) => {
    const previousValue = editContentRef.current;
    if (value === previousValue) {
      return;
    }

    const now = Date.now();
    if (
      previousValue !== ''
      && (undoStack.length === 0 || now - lastSnapshotAtRef.current >= SNAPSHOT_MIN_INTERVAL_MS)
    ) {
      setUndoStack((prev) => [...prev.slice(-(UNDO_HISTORY_LIMIT - 1)), previousValue]);
      lastSnapshotAtRef.current = now;
    }

    if (!isEditingRef.current) {
      setIsEditing(true);
    }
    setEditContent(value);
    setAutosaveState('dirty');
  }, [undoStack.length]);

  const undoEdit = useCallback(() => {
    setUndoStack((prev) => {
      const snapshot = prev[prev.length - 1];
      if (snapshot === undefined) {
        return prev;
      }
      setEditContent(snapshot);
      setAutosaveState(snapshot === contentRef.current ? 'idle' : 'dirty');
      return prev.slice(0, -1);
    });
  }, []);

  const confirmDiscardChanges = useCallback(async () => {
    if (!isDirty) {
      return true;
    }

    return await confirmAction(`Discard unsaved changes in ${saveTitle}?`, 'Unsaved Changes');
  }, [isDirty, saveTitle]);

  const cancelEditing = useCallback(async () => {
    if (!await confirmDiscardChanges()) {
      return false;
    }

    setEditContent(content);
    setIsEditing(false);
    setUndoStack([]);
    setAutosaveState('idle');
    return true;
  }, [confirmDiscardChanges, content]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  useEffect(() => {
    if (!isEditing || !isDirty || saving) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runSave({ exitEditing: false, notify: false, autosave: true });
    }, autosaveDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autosaveDelayMs, isDirty, isEditing, runSave, saving]);

  return {
    content,
    editContent,
    loading,
    isEditing,
    saving,
    isDirty,
    autosaveState,
    lastSavedAt,
    canUndo: undoStack.length > 0,
    setEditContent: setDraftContent,
    setIsEditing: startEditing,
    handleSave,
    cancelEditing,
    undoEdit,
    confirmDiscardChanges,
  };
}
