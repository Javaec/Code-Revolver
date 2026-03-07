import { useEffect, useRef } from 'react';

export function useIntervalTask(
  enabled: boolean,
  intervalMs: number,
  task: () => void | Promise<void>,
): void {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const timerId = window.setInterval(() => {
      void taskRef.current();
    }, intervalMs);

    return () => window.clearInterval(timerId);
  }, [enabled, intervalMs]);
}
