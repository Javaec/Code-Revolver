import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTextDocumentEditor } from './useTextDocumentEditor';
import { NotificationsProvider } from '../lib/notifications';

function wrapper({ children }: { children: React.ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

describe('useTextDocumentEditor', () => {
  it('loads content on mount', async () => {
    const load = vi.fn().mockResolvedValue('initial');
    const save = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTextDocumentEditor({
      load,
      save,
      saveTitle: 'TestDoc',
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.content).toBe('initial');
    expect(result.current.editContent).toBe('initial');
  });

  it('saves edited content and exits edit mode', async () => {
    const load = vi.fn().mockResolvedValue('initial');
    const save = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTextDocumentEditor({
      load,
      save,
      saveTitle: 'TestDoc',
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setIsEditing(true);
      result.current.setEditContent('updated');
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(save).toHaveBeenCalledWith('updated');
    expect(result.current.content).toBe('updated');
    expect(result.current.isEditing).toBe(false);
  });
});
