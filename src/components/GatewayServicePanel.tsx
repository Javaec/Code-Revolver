import { useMemo } from 'react';
import { GatewaySettings } from '../types';
import { Badge, Button, Card, Input } from './ui';
import { useGatewayService } from '../hooks/useGatewayService';
import { validateGatewaySettings } from '../lib/gateway';

interface GatewayServicePanelProps {
  gateway: GatewaySettings;
  onUpdateGateway: (updates: Partial<GatewaySettings>) => void;
}

function formatLastPing(timestamp?: number): string {
  if (!timestamp) return 'No keepalive ping yet';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

export function GatewayServicePanel({ gateway, onUpdateGateway }: GatewayServicePanelProps) {
  const {
    showKey,
    platformKeyInput,
    loadingPlatformKey,
    healthChecking,
    statusLabel,
    setShowKey,
    setPlatformKeyInput,
    loadPlatformKey,
    pingGateway,
  } = useGatewayService({ gateway, onUpdateGateway });

  const validationError = useMemo(() => validateGatewaySettings(gateway), [gateway]);

  return (
    <Card className="p-4 border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-slate-900/40 to-slate-900/50">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-blue-300">Local Gateway Service</h3>
          <p className="text-xs text-slate-400 mt-1">
            Unified endpoint for CLI/tools with platform key, manual OAuth fallback, and keepalive heartbeat.
          </p>
        </div>
        <Badge className={gateway.enabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-500/20 border-slate-500/30 text-slate-300'}>
          {statusLabel}
        </Badge>
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 mb-4">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Flow Visualization</div>
        <div className="flex flex-col sm:flex-row items-center gap-2 text-xs">
          <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-200">CLI / Tools</div>
          <span className="text-slate-500">→</span>
          <div className="rounded-md border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-blue-200">Local Gateway</div>
          <span className="text-slate-500">→</span>
          <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-200">Codex Platform</div>
          <span className="text-slate-500">→</span>
          <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-amber-200">
            OAuth Callback ({gateway.manualOAuthCallback ? 'Manual Fallback' : 'Auto'})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Gateway Endpoint</label>
          <Input
            value={gateway.endpoint}
            onChange={(e) => onUpdateGateway({ endpoint: e.target.value })}
            className="h-8 text-xs"
            placeholder="http://127.0.0.1:8787"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Keepalive (sec)</label>
          <Input
            type="number"
            min={15}
            max={3600}
            value={gateway.keepAliveIntervalSec}
            onChange={(e) => onUpdateGateway({ keepAliveIntervalSec: Math.max(15, Math.min(3600, Number(e.target.value) || 45)) })}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Platform Key</label>
        <div className="flex gap-2">
          <Input
            type={showKey ? 'text' : 'password'}
            value={platformKeyInput}
            onFocus={() => void loadPlatformKey()}
            onChange={(e) => setPlatformKeyInput(e.target.value)}
            className="h-8 text-xs"
            placeholder={gateway.hasStoredPlatformKey && !platformKeyInput ? 'Stored in secure storage' : 'pk_live_...'}
          />
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => void setShowKey()}>
            {loadingPlatformKey ? 'Loading...' : showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={gateway.manualOAuthCallback}
            onChange={(e) => onUpdateGateway({ manualOAuthCallback: e.target.checked })}
            className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-slate-700"
          />
          Enable manual OAuth callback fallback
        </label>
        <Input
          value={gateway.oauthCallbackUrl}
          onChange={(e) => onUpdateGateway({ oauthCallbackUrl: e.target.value })}
          className="h-8 text-xs"
          placeholder="http://127.0.0.1:8787/oauth/callback"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1 text-xs text-slate-400">
          <div>Keepalive: {formatLastPing(gateway.lastKeepAliveAt)}</div>
          <div>
            Health: {gateway.lastHealthCheckAt
              ? `${gateway.lastHealthLatencyMs ?? 0} ms${gateway.lastStatusCode ? ` • HTTP ${gateway.lastStatusCode}` : ''}`
              : 'No health probe yet'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs border-blue-500/25 text-blue-300 hover:bg-blue-500/10"
            onClick={() => void pingGateway()}
            disabled={healthChecking}
          >
            {healthChecking ? 'Checking...' : 'Ping'}
          </Button>
          <Button
            variant={gateway.enabled ? 'secondary' : 'default'}
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => onUpdateGateway({
              enabled: !gateway.enabled,
              status: gateway.enabled ? 'idle' : validationError ? 'offline' : 'online',
              lastKeepAliveAt: gateway.enabled ? gateway.lastKeepAliveAt : Date.now(),
            })}
          >
            {gateway.enabled ? 'Stop Gateway' : 'Start Gateway'}
          </Button>
        </div>
      </div>

      {validationError && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {validationError}
        </div>
      )}

      {!validationError && gateway.lastHealthError && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {gateway.lastHealthError}
        </div>
      )}
    </Card>
  );
}
