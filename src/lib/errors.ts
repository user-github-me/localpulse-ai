export type ProviderErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'quota'
  | 'network'
  | 'not-found'
  | 'bad-request'
  | 'server'
  | 'unsupported'
  | 'context-too-large'
  | 'unknown';

export interface ProviderErrorOptions {
  status?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** An error from an AI provider, classified so the router knows whether another provider may help. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(kind: ProviderErrorKind, message: string, options: ProviderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** True when trying the next provider could succeed. Auth and bad requests need the user. */
  get tryNextProvider(): boolean {
    return (
      this.kind === 'rate-limit' ||
      this.kind === 'quota' ||
      this.kind === 'network' ||
      this.kind === 'server' ||
      this.kind === 'unsupported' ||
      this.kind === 'context-too-large'
    );
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
