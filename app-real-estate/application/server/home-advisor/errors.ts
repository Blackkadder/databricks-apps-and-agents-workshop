export type HomeAdvisorErrorCode =
  | 'HOME_ADVISOR_NOT_CONFIGURED'
  | 'CONVERSATION_BUSY'
  | 'CONVERSATION_NOT_FOUND'
  | 'REQUEST_CANCELED'
  | 'GENIE_TIMEOUT'
  | 'GENIE_PERMISSION_DENIED'
  | 'GENIE_UNAVAILABLE'
  | 'GENIE_RESPONSE_INVALID'
  | 'LISTING_VERIFICATION_UNAVAILABLE';

export class HomeAdvisorError extends Error {
  constructor(
    readonly code: HomeAdvisorErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    cause?: unknown
  ) {
    super(message);
    this.name = 'HomeAdvisorError';
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function normalizeHomeAdvisorError(error: unknown): HomeAdvisorError {
  if (error instanceof HomeAdvisorError) return error;
  if (error instanceof Error && (error.name === 'AbortError' || /abort|cancel/i.test(error.message))) {
    return new HomeAdvisorError('REQUEST_CANCELED', 'The Home Advisor request was canceled.', 499, true, error);
  }
  const message = error instanceof Error ? error.message : 'Unknown Genie error';
  if (/not bound|not configured|missing.*space|space.*missing/i.test(message)) {
    return new HomeAdvisorError(
      'HOME_ADVISOR_NOT_CONFIGURED',
      'The Home Advisor Genie Space is not configured or bound.',
      503,
      false,
      error
    );
  }
  if (/timed?\s*out|timeout/i.test(message)) {
    return new HomeAdvisorError(
      'GENIE_TIMEOUT',
      'Genie did not respond before the configured timeout.',
      504,
      true,
      error
    );
  }
  if (/forbidden|permission|unauthori[sz]ed|403|401/i.test(message)) {
    return new HomeAdvisorError(
      'GENIE_PERMISSION_DENIED',
      'The caller does not have permission to use the configured Genie Space.',
      403,
      false,
      error
    );
  }
  return new HomeAdvisorError('GENIE_UNAVAILABLE', `Genie is unavailable: ${message}`, 503, true, error);
}
