export class CommandError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

function hasMessage(value: unknown): value is { message: string; code?: string } {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof (value as { message: unknown }).message === 'string';
}

export function toErrorMessage(error: unknown): string {
  const raw = hasMessage(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error ?? 'Unknown error');

  return raw
    .replace(/^Error:\s*/i, '')
    .replace(/^Command\s+\w+\s+failed:\s*/i, '')
    .trim() || 'Unknown error';
}
