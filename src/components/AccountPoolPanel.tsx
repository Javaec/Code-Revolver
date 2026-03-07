import { AccountInfo } from '../types';
import { Badge, Button, Card } from './ui';

interface AccountPoolPanelProps {
  accounts: AccountInfo[];
  rankedCandidates: AccountInfo[];
  autoSwitchEnabled: boolean;
  autoSwitchThreshold: number;
  onToggleAutoSwitch: (enabled: boolean) => void;
  onEditAccountPool: (account: AccountInfo) => void;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function getUsageValue(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatUsageLabel(value: number | undefined): string {
  const usage = getUsageValue(value);
  return usage === null ? '--' : `${Math.round(usage)}%`;
}

export function AccountPoolPanel({
  accounts,
  rankedCandidates,
  autoSwitchEnabled,
  autoSwitchThreshold,
  onToggleAutoSwitch,
  onEditAccountPool,
}: AccountPoolPanelProps) {
  const activeAccount = accounts.find((account) => account.isActive) || null;
  const availableAccounts = accounts.filter((account) => !account.isTokenExpired);
  const primarySnapshot = average(
    availableAccounts
      .map((account) => getUsageValue(account.usage?.primaryWindow?.usedPercent))
      .filter((value): value is number => value !== null),
  );
  const weeklySnapshot = average(
    availableAccounts
      .map((account) => getUsageValue(account.usage?.secondaryWindow?.usedPercent))
      .filter((value): value is number => value !== null),
  );

  return (
    <Card className="p-3 border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/35 to-slate-900/45">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-cyan-300">Local Account Pool</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Simple mode: only priority + usage snapshots.</p>
        </div>
        <Badge className={`text-[10px] ${autoSwitchEnabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-500/20 border-slate-500/30 text-slate-300'}`}>
          {autoSwitchEnabled ? 'Auto-Switch ON' : 'Auto-Switch OFF'}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] text-slate-400 truncate">
          Active: <span className="text-slate-200">{activeAccount?.name || 'none'}</span>
        </div>
        <Button
          variant={autoSwitchEnabled ? 'secondary' : 'default'}
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => onToggleAutoSwitch(!autoSwitchEnabled)}
        >
          {autoSwitchEnabled ? 'Disable' : 'Enable'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Profiles</div>
          <div className="text-sm font-semibold text-white">{accounts.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Ready</div>
          <div className="text-sm font-semibold text-emerald-300">{availableAccounts.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Switch At</div>
          <div className="text-sm font-semibold text-primary-300">{autoSwitchThreshold}%</div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-950/40 p-2 mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-300 mb-2">
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5">5h/7d usage</span>
          <span className="text-slate-500">→</span>
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5">priority</span>
          <span className="text-slate-500">→</span>
          <span className="rounded border border-primary-400/30 bg-primary-500/10 px-2 py-0.5">switch</span>
        </div>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>5H</span>
              <span>{primarySnapshot === null ? '--' : `${Math.round(primarySnapshot)}%`}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500/70 to-cyan-300/70" style={{ width: `${clampPercent(primarySnapshot ?? 0)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>7D</span>
              <span>{weeklySnapshot === null ? '--' : `${Math.round(weeklySnapshot)}%`}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500/70 to-emerald-300/70" style={{ width: `${clampPercent(weeklySnapshot ?? 0)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Top Candidates</div>
        {rankedCandidates.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-400">
            No safe candidate yet.
          </div>
        ) : (
          <div className="space-y-1">
            {rankedCandidates.slice(0, 3).map((candidate, index) => (
              <div key={candidate.filePath} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white truncate">
                      #{index + 1} {candidate.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Priority {candidate.pool?.priority ?? 5} | 5H {formatUsageLabel(candidate.usage?.primaryWindow?.usedPercent)} | 7D {formatUsageLabel(candidate.usage?.secondaryWindow?.usedPercent)}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/10"
                    onClick={() => onEditAccountPool(candidate)}
                  >
                    Priority
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
