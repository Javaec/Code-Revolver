export type ProgressColorState = 'success' | 'warning' | 'danger';

/**
 * Get color state based on remaining percentage
 * @param value Used percentage
 * @returns Color state
 */
export function getProgressColorState(value: number): ProgressColorState {
  const remaining = 100 - value;
  if (remaining <= 10) return 'danger';
  if (remaining <= 30) return 'warning';
  return 'success';
}

/**
 * Get stroke color class based on color state
 */
export function getStrokeColorClass(state: ProgressColorState): string {
  switch (state) {
    case 'danger':
      return 'stroke-rose-500';
    case 'warning':
      return 'stroke-amber-500';
    case 'success':
      return 'stroke-emerald-500';
  }
}

/**
 * Get text color class based on color state
 */
export function getTextColorClass(state: ProgressColorState): string {
  switch (state) {
    case 'danger':
      return 'text-rose-400';
    case 'warning':
      return 'text-amber-400';
    case 'success':
      return 'text-emerald-400';
  }
}

/**
 * Get background color class based on color state
 */
export function getBgColorClass(state: ProgressColorState): string {
  switch (state) {
    case 'danger':
      return 'bg-rose-500';
    case 'warning':
      return 'bg-amber-500';
    case 'success':
      return 'bg-emerald-500';
  }
}

/**
 * Format relative time (e.g., "in 2h 15m" or "in 3d")
 */
export function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diffMs = (timestamp * 1000) - now; // resets_at is usually in seconds
  
  if (diffMs <= 0) return 'Resetting...';
  
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffDay > 0) {
    return `in ${diffDay}d ${diffHour % 24}h`;
  }
  if (diffHour > 0) {
    return `in ${diffHour}h ${diffMin % 60}m`;
  }
  if (diffMin > 0) {
    return `in ${diffMin}m`;
  }
  return 'in < 1m';
}
