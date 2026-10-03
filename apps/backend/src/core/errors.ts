export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 403,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export function invariant(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
