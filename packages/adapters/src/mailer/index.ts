import { AwsClient } from "aws4fetch";

export interface SendRawInput {
  /** Envelope sender, e.g. kunal@send0.email (must be a verified identity) */
  from: string;
  /** Envelope recipients: To + Cc + Bcc */
  recipients: string[];
  /** Complete RFC 5322 message */
  raw: string;
  /** Attached to every SES event for this message, so events map back to our rows */
  tags: Record<string, string>;
}

export interface Mailer {
  /** Returns the provider's message id. Throws MailerError on rejection. */
  sendRaw(input: SendRawInput): Promise<{ providerMessageId: string }>;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when retrying later might work (throttling, 5xx) */
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface SesConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Unset: SES applies the account's default configuration set, if any (no event publishing otherwise) */
  configurationSet?: string;
}

const TAG_VALUE = /[^A-Za-z0-9_.@-]/g;

/** SES v2 SendEmail with raw content, over plain fetch + SigV4 (works on Workers and Node). */
export class SesMailer implements Mailer {
  private readonly client: AwsClient;
  private readonly endpoint: string;
  private readonly accountEndpoint: string;

  constructor(private readonly cfg: SesConfig) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: "ses",
      retries: 0,
    });
    this.endpoint = `https://email.${cfg.region}.amazonaws.com/v2/email/outbound-emails`;
    this.accountEndpoint = `https://email.${cfg.region}.amazonaws.com/v2/email/account`;
  }

  /**
   * Checks the credentials with SES v2 GetAccount (read-only, sends nothing); used by `send0 doctor`.
   * Resolves with whether the account may send at all, and whether it has left the SES sandbox.
   */
  async verify(opts: { signal?: AbortSignal } = {}): Promise<{ sendingEnabled: boolean; productionAccessEnabled: boolean }> {
    const res = await this.client.fetch(this.accountEndpoint, { method: "GET", ...(opts.signal ? { signal: opts.signal } : {}) });
    const text = await res.text();
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const err = JSON.parse(text) as { message?: string; Message?: string; __type?: string };
        code = err.__type?.split("#").pop();
        message = err.message ?? err.Message ?? message;
      } catch {}
      throw new MailerError(`SES rejected the credentials check: ${message.slice(0, 300)}`, res.status, res.status >= 500, code);
    }
    const account = JSON.parse(text) as { SendingEnabled?: boolean; ProductionAccessEnabled?: boolean };
    return { sendingEnabled: account.SendingEnabled === true, productionAccessEnabled: account.ProductionAccessEnabled === true };
  }

  async sendRaw(input: SendRawInput): Promise<{ providerMessageId: string }> {
    const bytes = new TextEncoder().encode(input.raw);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const body = {
      FromEmailAddress: input.from,
      Destination: { ToAddresses: input.recipients },
      Content: { Raw: { Data: btoa(bin) } },
      ConfigurationSetName: this.cfg.configurationSet,
      // SES tags allow only [A-Za-z0-9_.@-] in names and values.
      EmailTags: Object.entries(input.tags).map(([Name, Value]) => ({ Name, Value: Value.replace(TAG_VALUE, "_").slice(0, 256) })),
    };
    const res = await this.client.fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let code: string | undefined;
      let message = text.slice(0, 300);
      try {
        const err = JSON.parse(text) as { message?: string; __type?: string };
        code = err.__type?.split("#").pop();
        message = err.message ?? message;
      } catch {}
      const retryable = res.status >= 500 || res.status === 429 || code === "TooManyRequestsException" || code === "LimitExceededException";
      throw new MailerError(`SES rejected the message: ${message}`, res.status, retryable, code);
    }
    const { MessageId } = JSON.parse(text) as { MessageId: string };
    return { providerMessageId: MessageId };
  }
}
