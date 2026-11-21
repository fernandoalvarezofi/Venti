import type { Config } from '../config.ts';
import { AppError } from './errors.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Versión HTML opcional (el texto queda como alternativa para clientes sin HTML). */
  html?: string;
  /** Etiqueta para búsqueda en tests y métricas: verify_email, password_reset, account_exists, tickets_pending_claim. */
  kind: string;
  /** Datos estructurados (enlaces) para tests; nunca contienen secretos que no estén ya en el texto. */
  meta?: Record<string, string>;
}

export interface EmailSender {
  readonly enabled: boolean;
  send(msg: EmailMessage): Promise<void>;
}

/** Envío real con Resend (https://resend.com/docs/api-reference/emails/send-email). */
class ResendSender implements EmailSender {
  readonly enabled = true;
  private readonly apiKey: string;
  private readonly from: string;
  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}), tags: [{ name: 'kind', value: msg.kind }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend respondió ${res.status}: ${detail.slice(0, 200)}`);
    }
  }
}

/** Buzón en memoria para desarrollo y tests. La configuración impide usarlo en producción. */
export class OutboxSender implements EmailSender {
  readonly enabled = true;
  readonly sent: EmailMessage[] = [];
  private readonly log: boolean;
  constructor(log: boolean) {
    this.log = log;
  }

  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    if (this.log) console.log(`\n[email:${msg.kind}] para ${msg.to}\n${msg.subject}\n${msg.text}\n`);
  }

  /** Último email de un tipo para un destinatario (tests). */
  last(to: string, kind: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to.toLowerCase() && m.kind === kind);
  }
}

class DisabledSender implements EmailSender {
  readonly enabled = false;
  async send(): Promise<void> {
    throw new AppError(503, 'email_unavailable', 'El envío de emails todavía no está configurado en Lintick. Probá más tarde.');
  }
}

export function createEmailSender(config: Config): EmailSender {
  if (config.EMAIL_PROVIDER === 'resend') return new ResendSender(config.RESEND_API_KEY!, config.EMAIL_FROM);
  if (config.EMAIL_PROVIDER === 'outbox') return new OutboxSender(config.NODE_ENV === 'development');
  return new DisabledSender();
}
