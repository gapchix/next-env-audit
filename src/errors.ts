/** Expected, user-actionable failure — the CLI prints the message without a stack trace. */
export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditError';
  }
}
