import * as React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-primary-500/40 bg-primary-500/20 text-primary-200',
  secondary: 'border-white/15 bg-white/10 text-slate-200',
  outline: 'border-white/25 bg-transparent text-slate-200',
  success: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  warning: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  danger: 'border-rose-500/35 bg-rose-500/15 text-rose-300',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
