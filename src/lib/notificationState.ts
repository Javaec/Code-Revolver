import { createContext, useContext } from 'react';

export type NotificationTone = 'info' | 'success' | 'error';

export type NotificationInput = {
  title?: string;
  message: string;
  tone?: NotificationTone;
};

export type NotificationsContextValue = {
  notify: (input: NotificationInput) => void;
  notifyError: (message: string, title?: string) => void;
  notifySuccess: (message: string, title?: string) => void;
  notifyInfo: (message: string, title?: string) => void;
};

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used inside NotificationsProvider');
  }
  return context;
}
