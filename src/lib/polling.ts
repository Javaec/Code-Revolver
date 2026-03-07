export function withJitter(baseDelayMs: number, jitterRatio = 0.2): number {
  const jitter = baseDelayMs * jitterRatio;
  const offset = (Math.random() * jitter * 2) - jitter;
  return Math.max(1_000, Math.round(baseDelayMs + offset));
}

export function nextBackoffDelay(currentDelayMs: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, Math.max(1_000, Math.round(currentDelayMs * 2)));
}
