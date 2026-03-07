export function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return raw
    .replace(/^Error:\s*/i, '')
    .replace(/^Command\s+\w+\s+failed:\s*/i, '')
    .trim() || 'Unknown error';
}
