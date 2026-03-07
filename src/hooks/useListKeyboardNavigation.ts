import type { KeyboardEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

interface UseListKeyboardNavigationOptions<T> {
  items: T[];
  selectedKey: string | null;
  getKey: (item: T) => string;
  onSelect: (item: T) => Promise<void> | void;
  onDelete?: (item: T) => Promise<void> | void;
}

export function useListKeyboardNavigation<T>({
  items,
  selectedKey,
  getKey,
  onSelect,
  onDelete,
}: UseListKeyboardNavigationOptions<T>) {
  const selectedIndex = useMemo(() => {
    if (!selectedKey) return items.length > 0 ? 0 : -1;
    return items.findIndex((item) => getKey(item) === selectedKey);
  }, [getKey, items, selectedKey]);

  const [manualFocusedIndex, setManualFocusedIndex] = useState<number | null>(null);
  const focusedIndex = useMemo(() => {
    if (manualFocusedIndex !== null && manualFocusedIndex >= 0 && manualFocusedIndex < items.length) {
      return manualFocusedIndex;
    }
    if (selectedIndex >= 0) {
      return selectedIndex;
    }
    return items.length > 0 ? 0 : -1;
  }, [items.length, manualFocusedIndex, selectedIndex]);

  const selectByIndex = useCallback((index: number) => {
    const next = items[index];
    if (!next) return;
    setManualFocusedIndex(index);
    void onSelect(next);
  }, [items, onSelect]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (items.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = focusedIndex < items.length - 1 ? focusedIndex + 1 : items.length - 1;
      selectByIndex(nextIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = focusedIndex > 0 ? focusedIndex - 1 : 0;
      selectByIndex(nextIndex);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      selectByIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      selectByIndex(items.length - 1);
      return;
    }

    if (event.key === 'Enter' && focusedIndex >= 0) {
      event.preventDefault();
      selectByIndex(focusedIndex);
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete && focusedIndex >= 0) {
      event.preventDefault();
      void onDelete(items[focusedIndex]);
    }
  }, [focusedIndex, items, onDelete, selectByIndex]);

  return {
    focusedIndex,
    handleKeyDown,
    setFocusedIndex: setManualFocusedIndex,
  };
}
