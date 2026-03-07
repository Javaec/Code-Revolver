import { GatewaySettings } from '../types';
import { commands } from './commands';

export function validateGatewaySettings(gateway: GatewaySettings): string | null {
  if (!gateway.endpoint.trim()) {
    return 'Gateway endpoint is required';
  }

  try {
    new URL(gateway.endpoint);
  } catch {
    return 'Gateway endpoint must be a valid URL';
  }

  if (gateway.manualOAuthCallback) {
    try {
      new URL(gateway.oauthCallbackUrl);
    } catch {
      return 'OAuth callback URL must be a valid URL';
    }
  }

  return null;
}

export async function resolveGatewayPlatformKey(gateway: GatewaySettings): Promise<string> {
  if (gateway.platformKey.trim().length > 0) {
    return gateway.platformKey.trim();
  }

  if (!gateway.hasStoredPlatformKey) {
    return '';
  }

  return (await commands.getGatewayPlatformKey()) ?? '';
}
