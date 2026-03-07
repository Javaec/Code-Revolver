import { useCallback, useEffect, useMemo, useState } from 'react';
import { GatewaySettings } from '../types';
import { useNotifications } from '../lib/notificationState';
import { resolveGatewayPlatformKey, validateGatewaySettings } from '../lib/gateway';
import { toErrorMessage } from '../lib/errors';

interface UseGatewayServiceOptions {
  gateway: GatewaySettings;
  onUpdateGateway: (updates: Partial<GatewaySettings>) => void;
}

export function useGatewayService({ gateway, onUpdateGateway }: UseGatewayServiceOptions) {
  const [showKey, setShowKey] = useState(false);
  const [platformKeyInput, setPlatformKeyInput] = useState('');
  const [loadingPlatformKey, setLoadingPlatformKey] = useState(false);
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

  const pingGateway = useCallback(() => {
    const validationError = validateGatewaySettings(gateway);
    if (validationError) {
      notifyError(validationError, 'Gateway');
      return;
    }

    onUpdateGateway({
      status: 'online',
      lastKeepAliveAt: Date.now(),
    });
    notifyInfo('Gateway keepalive ping recorded', 'Gateway');
  }, [gateway, notifyError, notifyInfo, onUpdateGateway]);

  return {
    showKey,
    platformKeyInput,
    loadingPlatformKey,
    statusLabel,
    setShowKey: toggleKeyVisibility,
    setPlatformKeyInput: updatePlatformKey,
    loadPlatformKey,
    pingGateway,
  };
}
