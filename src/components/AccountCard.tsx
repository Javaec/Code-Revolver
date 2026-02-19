import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { AccountInfo, MutationResult } from '../types';
import { Badge, Button, Card, Input, LinearProgress } from './ui';
import { getAccountCardVariant, getPlanBadgeClasses } from '../utils/account';
import { formatRelativeTime } from '../utils/progress';

interface AccountCardProps {
  account: AccountInfo;
  onSwitch: () => void;
  onEdit: () => void;
  onEditPool?: () => void;
  onDelete?: () => void;
  isBestCandidate?: boolean;
  isPrivacyMode?: boolean;
  isUsageLoading?: boolean;
  renameAccount: (oldPath: string, newName: string) => Promise<MutationResult>;
  onRefresh?: () => void;
}

export function AccountCard({ account, onSwitch, onEdit, onEditPool, onDelete, isBestCandidate, isPrivacyMode, isUsageLoading, renameAccount, onRefresh }: AccountCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(account.name);
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setNewName(account.name);
  }, [account.name]);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const isTokenExpired = account.isTokenExpired;
  const cardVariant = getAccountCardVariant(account.isActive, !!isTokenExpired);
  const planBadge = getPlanBadgeClasses(account.planType);
  const cardClasses = cardVariant === 'danger'
    ? 'border-rose-500/35 bg-gradient-to-r from-rose-900/20 to-slate-900/50'
    : cardVariant === 'active'
      ? 'border-primary-400/45 shadow-glow bg-gradient-to-r from-primary-900/20 to-slate-900/50'
      : 'border-white/15 bg-gradient-to-r from-slate-900/45 to-slate-900/60';

  const formatSubscription = (date: string | null) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    const now = new Date();
    const diffTime = d.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const dateStr = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
    if (daysLeft < 0) return `${dateStr} (Expired)`;
    if (daysLeft === 0) return `${dateStr} (Expires today)`;
    return `${dateStr} (${daysLeft} days left)`;
  };

  const formatQueryTime = (timestamp?: number) => {
    if (!timestamp) return 'Never queried';
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatAuthUpdated = (timestampMs: number) => {
    const d = new Date(timestampMs);
    return d.toLocaleString('en-US', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const authUpdatedAtMs = account.authUpdatedAt;
  const expireAtMs = authUpdatedAtMs + TWO_WEEKS_MS;
  const expireAtSec = Math.floor(expireAtMs / 1000);
  const expireElapsed = Math.max(0, Date.now() - authUpdatedAtMs);
  const expirePercent = Math.min(100, Math.max(0, (expireElapsed / TWO_WEEKS_MS) * 100));
  const needsRelogin = expirePercent >= 95;

  const handleRename = async () => {
    if (newName.trim() && newName !== account.name) {
      try {
        await renameAccount(account.filePath, newName.trim());
      } catch (error) {
        console.error('Rename failed:', error);
        setNewName(account.name);
      }
    } else {
      setNewName(account.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    }
    if (e.key === 'Escape') {
      setNewName(account.name);
      setIsEditing(false);
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      const result = await invoke<string>('refresh_account_token', { filePath: account.filePath });
      console.log('Token refresh result:', result);
      alert(result);
      onRefresh?.();
    } catch (error) {
      console.error('Token refresh failed:', error);
      alert(`Refresh failed: ${error}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card
      className={`group p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 ${cardClasses}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) {
          return;
        }
        onEdit();
      }}
    >
      {/* Header Row: Name + Badges */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {account.isActive && (
          <motion.span
            className="w-2 h-2 rounded-full bg-primary-500 shadow-glow"
            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-6 w-[110px] border-white/20 bg-slate-900/70 px-2 py-0.5 text-xs font-semibold text-white"
              autoFocus
              onKeyDown={handleKeyDown}
              onBlur={handleRename}
            />
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 group/title cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          >
            <h3 className={`font-bold text-[15px] text-white truncate max-w-[112px] transition-all ${isPrivacyMode ? 'blur-md select-none' : ''}`} title={account.name}>
              {account.name}
            </h3>
          </div>
        )}

        <Badge className={`px-1.5 py-0.5 text-[9px] rounded-md font-bold border ${planBadge.classes}`}>
          {planBadge.text}
        </Badge>

        <Badge className="px-1.5 py-0.5 text-[9px] rounded-md font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300">
          P{account.pool?.priority ?? 5}
        </Badge>

        {!isEditing && (
          <Button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-slate-500 hover:text-white"
            title="Rename Profile"
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </Button>
        )}

        {isBestCandidate && !account.isActive && (
          <motion.span
            className="px-1.5 py-0.5 text-[10px] rounded-md font-bold bg-gradient-to-r from-amber-500/30 to-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Best
          </motion.span>
        )}

        {isTokenExpired && (
          <motion.span
            className="px-1.5 py-0.5 text-[10px] rounded-md font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-0.5"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="w-1 h-1 rounded-full bg-rose-500" />
            Expired
          </motion.span>
        )}
      </div>

      {/* Content: Left Info | Center Timing | Right Controls */}
      <div className="flex items-start gap-3">
        {/* Left: Account Info */}
        <div className="flex flex-col space-y-1 min-w-0 w-[220px]">
          <div className="flex items-center gap-2 text-slate-400">
            <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className={`truncate text-[11px] select-all transition-all ${isPrivacyMode ? 'blur-md select-none' : ''}`} title={account.email}>{account.email}</span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={`text-[11px] truncate ${isTokenExpired ? 'text-rose-400' : ''}`}>
              {formatSubscription(account.subscriptionEnd)}
            </span>
          </div>
        </div>

        {/* Center: Timing */}
        <div className="flex flex-col space-y-1 min-w-0 w-[220px] text-slate-400">
          <div className="flex items-center gap-2">
            <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[11px] truncate">{formatQueryTime(account.lastUsageUpdate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7H7a2 2 0 00-2 2v8m8-10h4a2 2 0 012 2v4m-6 4h4a2 2 0 002-2v-2m-6 4H7a2 2 0 01-2-2v-2" />
            </svg>
            <span className="text-[11px] truncate">Auth updated: {formatAuthUpdated(authUpdatedAtMs)}</span>
          </div>
          <div className="pt-1">
            <LinearProgress
              value={expirePercent}
              label="Expire"
              subLabel={formatRelativeTime(expireAtSec)}
            />
          </div>
          {needsRelogin && (
            <div className="text-[11px] text-amber-300">
              Please log in again.
            </div>
          )}
        </div>

        {/* Right: Progress + Actions */}
        <div className="flex items-start gap-3 flex-shrink-0">
          <div className="flex flex-col gap-2 w-40">
            <LinearProgress
              value={account.usage?.primaryWindow?.usedPercent ?? 0}
              label="5H Limit"
              subLabel={formatRelativeTime(account.usage?.primaryWindow?.resetsAt)}
            />
            <LinearProgress
              value={account.usage?.secondaryWindow?.usedPercent ?? 0}
              label="Weekly"
              subLabel={formatRelativeTime(account.usage?.secondaryWindow?.resetsAt)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleRefreshToken();
              }}
              disabled={refreshing}
              title="Refresh Token"
              variant="outline"
              size="icon"
              className="h-7 w-7"
            >
              {refreshing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </Button>

            <Button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete account "${account.name}"?`)) {
                  onDelete?.();
                }
              }}
              title="Delete Account"
              variant="outline"
              size="icon"
              className="h-7 w-7 border-rose-300/25 bg-rose-300/10 text-rose-200 hover:bg-rose-300/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
            </div>

            {!account.isActive && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onSwitch();
              }}
              disabled={!!isTokenExpired}
              title="Switch to this account"
              size="icon"
              className="h-9 w-9 bg-primary-500/25 text-primary-200 hover:bg-primary-500/40 border border-primary-400/30"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </Button>
            )}

            {onEditPool && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onEditPool();
              }}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/10"
              title="Configure switch priority"
            >
              Priority {account.pool?.priority ?? 5}
            </Button>
            )}
          </div>

          {isUsageLoading && (
            <div className="flex items-center justify-center h-7 w-7 rounded-md border border-white/10 bg-white/[0.03]">
              <svg className="w-3.5 h-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
