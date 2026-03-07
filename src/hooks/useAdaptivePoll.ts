import { useEffect, useRef } from 'react';
import { nextBackoffDelay, withJitter } from '../lib/polling';

interface UseAdaptivePollOptions {
  enabled: boolean;
  baseDelayMs: number;
  maxDelayMs: number;
  task: () => Promise<boolean>;
}

export function useAdaptivePoll({
  enabled,
  baseDelayMs,
  maxDelayMs,
  task,
}: UseAdaptivePollOptions): void {
  const taskRef = useRef(task);
  const delayRef = useRef(baseDelayMs);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    delayRef.current = baseDelayMs;
  }, [baseDelayMs]);

  useEffect(() => {
    if (!enabled) {
      delayRef.current = baseDelayMs;
      return;
    }

    let timeoutId: number | undefined;
    let cancelled = false;

    const schedule = () => {
      timeoutId = window.setTimeout(async () => {
        try {
          const succeeded = await taskRef.current();
          delayRef.current = succeeded ? baseDelayMs : nextBackoffDelay(delayRef.current, maxDelayMs);
        } catch {
          delayRef.current = nextBackoffDelay(delayRef.current, maxDelayMs);
        }

        if (!cancelled) {
          schedule();
        }
      }, withJitter(delayRef.current));
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [baseDelayMs, enabled, maxDelayMs]);
}
