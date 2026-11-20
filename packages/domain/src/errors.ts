/**
 * Error de regla de negocio. `code` es estable y se expone a los clientes;
 * `message` es para humanos y puede cambiar.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
