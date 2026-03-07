import { useCallback, useEffect, useMemo, useState } from 'react';
import { GatewaySettings } from '../types';
import { useNotifications } from '../lib/notificationState';
import { resolveGatewayPlatformKey, validateGatewaySettings } from '../lib/gateway';
import { toErrorMessage } from '../lib/errors';
import { probeGateway } from '../lib/gatewayHealth';
import { useAdaptivePoll } from './useAdaptivePoll';

interface UseGatewayServiceOptions {
  gateway: GatewaySettings;
  onUpdateGateway: (updates: Partial<GatewaySettings>) => void;
}

export function useGatewayService({ gateway, onUpdateGateway }: UseGatewayServiceOptions) {
  const [showKey, setShowKey] = useState(false);
  const [platformKeyInput, setPlatformKeyInput] = useState('');
  const [loadingPlatformKey, setLoadingPlatformKey] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const { notifyError, notifyInfo } = useNotifications();

  useEffect(() => {
    if (!showKey) {
      setPlatformKeyInput('');
    }
  }, [showKey]);

  const statusLabel = useMemo(() => {
    if (!gateway.enabled) return 'Stopped';
    if (gateway.status === 'online') return 'Online';
    if (gateway.status === 'offline') return 'Offline';
    return 'Idle';
  }, [gateway.enabled, gateway.status]);

  const loadPlatformKey = useCallback(async () => {
    if (platformKeyInput || !gateway.hasStoredPlatformKey) {
      return;
    }
    setLoadingPlatformKey(true);
    try {
      const key = await resolveGatewayPlatformKey(gateway);
      setPlatformKeyInput(key);
    } catch (error) {
      notifyError(toErrorMessage(error), 'Gateway Secret');
    } finally {
      setLoadingPlatformKey(false);
    }
  }, [gateway, notifyError, platformKeyInput]);

  const toggleKeyVisibility = useCallback(async () => {
    const next = !showKey;
    setShowKey(next);
    if (next) {
      await loadPlatformKey();
    }
  }, [loadPlatformKey, showKey]);

  const updatePlatformKey = useCallback((value: string) => {
    setPlatformKeyInput(value);
    onUpdateGateway({
      platformKey: value,
      hasStoredPlatformKey: value.trim().length > 0 || gateway.hasStoredPlatformKey,
    });
  }, [gateway.hasStoredPlatformKey, onUpdateGateway]);

  const refreshGatewayHealth = useCallback(async (options?: { silent?: boolean }) => {
    const validationError = validateGatewaySettings(gateway);
    if (validationError) {
      onUpdateGateway({
        status: 'offline',
        lastHealthError: validationError,
      });
      if (!options?.silent) {
        notifyError(validationError, 'Gateway');
      }
      return false;
    }

    setHealthChecking(true);
    const result = await probeGateway(gateway.endpoint);
    onUpdateGateway({
      status: result.ok ? 'online' : 'offline',
      lastKeepAliveAt: result.ok ? Date.now() : gateway.lastKeepAliveAt,
      lastHealthCheckAt: Date.now(),
      lastHealthLatencyMs: result.latencyMs,
      lastStatusCode: result.statusCode,
      lastHealthError: result.ok ? '' : result.error ?? 'Gateway probe failed',
    });

    if (!options?.silent) {
      if (result.ok) {
        notifyInfo(`Gateway responded in ${result.latencyMs} ms`, 'Gateway');
      } else {
        notifyError(result.error ?? 'Gateway probe failed', 'Gateway');
      }
    }
    setHealthChecking(false);
    return result.ok;
  }, [gateway, notifyError, notifyInfo, onUpdateGateway]);

  useAdaptivePoll({
    enabled: gateway.enabled,
    baseDelayMs: Math.max(15, gateway.keepAliveIntervalSec) * 1000,
    maxDelayMs: Math.max(60, gateway.keepAliveIntervalSec * 4) * 1000,
    task: async () => await refreshGatewayHealth({ silent: true }),
  });

  return {
    showKey,
    platformKeyInput,
    loadingPlatformKey,
    healthChecking,
    statusLabel,
    setShowKey: toggleKeyVisibility,
    setPlatformKeyInput: updatePlatformKey,
    loadPlatformKey,
    pingGateway: refreshGatewayHealth,
  };
}
