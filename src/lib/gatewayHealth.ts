export interface GatewayHealthProbeResult {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

async function tryGatewayUrl(url: string, timeoutMs: number): Promise<GatewayHealthProbeResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function probeGateway(endpoint: string, timeoutMs = 4_000): Promise<GatewayHealthProbeResult> {
  const trimmed = endpoint.trim().replace(/\/$/, '');
  if (!trimmed) {
    return { ok: false, latencyMs: 0, error: 'Gateway endpoint is empty' };
  }

  const healthResult = await tryGatewayUrl(`${trimmed}/health`, timeoutMs);
  if (healthResult.ok || healthResult.statusCode === 404 || healthResult.statusCode === 405) {
    if (healthResult.ok) {
      return healthResult;
    }
    return await tryGatewayUrl(trimmed, timeoutMs);
  }
  return healthResult;
}
