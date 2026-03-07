import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeGateway } from './gatewayHealth';

describe('gatewayHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns success for healthy endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await probeGateway('http://127.0.0.1:8787');

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('falls back to root endpoint after /health 404', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await probeGateway('http://127.0.0.1:8787');

    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('returns failure payload for server error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));

    const result = await probeGateway('http://127.0.0.1:8787');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});
