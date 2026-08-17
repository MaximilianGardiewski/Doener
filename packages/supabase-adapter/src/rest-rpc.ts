export interface SupabaseRpcErrorPayload {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export class SupabaseRpcError extends Error {
  readonly status: number;
  readonly payload?: SupabaseRpcErrorPayload;

  constructor(message: string, status: number, payload?: SupabaseRpcErrorPayload) {
    super(message);
    this.name = "SupabaseRpcError";
    this.status = status;
    this.payload = payload;
  }
}

export interface RpcClient {
  rpc<T>(functionName: string, args?: Record<string, unknown>): Promise<T>;
}

export interface SupabaseRestRpcClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Staff JWT or service-role token. Omit for anonymous publishable-key RPCs. */
  authorizationToken?: string;
  fetchImpl?: typeof fetch;
}

export class SupabaseRestRpcClient implements RpcClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly authorizationToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SupabaseRestRpcClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.authorizationToken = options.authorizationToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async rpc<T>(functionName: string, args: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = {
      apikey: this.apiKey,
      "content-type": "application/json",
      accept: "application/json",
    };
    if (this.authorizationToken) {
      headers.authorization = `Bearer ${this.authorizationToken}`;
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      },
    );

    const raw = await response.text();
    const parsed = raw ? safeJson(raw) : null;
    if (!response.ok) {
      const payload = isRpcPayload(parsed) ? parsed : undefined;
      throw new SupabaseRpcError(
        payload?.message ?? `Supabase RPC ${functionName} failed with HTTP ${response.status}`,
        response.status,
        payload,
      );
    }
    return parsed as T;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isRpcPayload(value: unknown): value is SupabaseRpcErrorPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
