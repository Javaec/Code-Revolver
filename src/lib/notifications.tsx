import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import {
  NotificationInput,
  NotificationTone,
  NotificationsContext,
  NotificationsContextValue,
} from './notificationState';

type NotificationItem = {
  id: number;
  title?: string;
  message: string;
  tone: NotificationTone;
};

const toneClasses: Record<NotificationTone, string> = {
  info: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((input: NotificationInput) => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);
    const nextItem: NotificationItem = {
      id,
      title: input.title,
      message: input.message,
      tone: input.tone ?? 'info',
    };

    setItems((prev) => [...prev, nextItem]);
    window.setTimeout(() => remove(id), input.tone === 'error' ? 6000 : 3500);
  }, [remove]);

  const value = useMemo<NotificationsContextValue>(() => ({
    notify,
    notifyError: (message, title) => notify({ message, title, tone: 'error' }),
    notifySuccess: (message, title) => notify({ message, title, tone: 'success' }),
    notifyInfo: (message, title) => notify({ message, title, tone: 'info' }),
  }), [notify]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${toneClasses[item.tone]}`}
            >
              {item.title && <div className="mb-1 text-xs font-semibold uppercase tracking-wide">{item.title}</div>}
              <div className="pr-6 text-sm leading-5">{item.message}</div>
              <button
                type="button"
                className="absolute right-3 top-3 text-xs text-white/70 hover:text-white"
                onClick={() => remove(item.id)}
              >
                Close
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationsContext.Provider>
  );
}
