export type VisuraParseErrorCode =
  | 'invalid-pdf'
  | 'password-required'
  | 'unsupported-pdf'
  | 'text-unavailable'
  | 'resource-limit'
  | 'malformed-content';

export class VisuraParseError extends Error {
  readonly code: VisuraParseErrorCode;

  constructor(
    code: VisuraParseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'VisuraParseError';
    this.code = code;
  }
}
