/**
 * Get the variant style for the account card
 */
export function getAccountCardVariant(
  isActive: boolean,
  isTokenExpired: boolean
): 'default' | 'active' | 'danger' {
  if (isTokenExpired) return 'danger';
  if (isActive) return 'active';
  return 'default';
}

/**
 * Get the styling classes for the Plan Badge
 */
export function getPlanBadgeClasses(plan: string): { text: string; classes: string } {
  switch (plan) {
    case 'plus':
      return { text: 'Plus', classes: 'bg-gradient-to-r from-emerald-600/40 to-emerald-500/30 text-emerald-400 border-emerald-500/30' };
    case 'team':
      return { text: 'Team', classes: 'bg-gradient-to-r from-blue-600/40 to-blue-500/30 text-blue-400 border-blue-500/30' };
    case 'pro':
      return { text: 'Pro', classes: 'bg-gradient-to-r from-purple-600/40 to-purple-500/30 text-purple-400 border-purple-500/30' };
    default:
      return { text: plan, classes: 'bg-gradient-to-r from-slate-600/40 to-slate-500/30 text-slate-400 border-slate-500/30' };
  }
}
