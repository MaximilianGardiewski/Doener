export interface PublicEndpointHealthInput {
  publicUrl: string;
  publishableKey: string;
  secretKey: string;
  allowHttp?: boolean;
}

export interface PublicEndpointHealthReport {
  healthy: boolean;
  checks: {
    httpsBoundary: boolean;
    authHealth: boolean;
    restWithSecretKey: boolean;
    apiKeyEnforcement: boolean;
  };
  authVersion?: string;
}

export interface PublicEndpointVerifier {
  verify(input: PublicEndpointHealthInput): Promise<PublicEndpointHealthReport>;
}

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function safeUrl(input: string, allowHttp: boolean): URL {
  const url = new URL(input);
  if (url.username || url.password) throw new Error("public Supabase URL must not contain credentials");
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error("public Supabase endpoint must use HTTPS");
  }
  return url;
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Verifies the public path through the reverse proxy and Envoy rather than only
 * container liveness. Redirects are deliberately disabled so privileged API keys
 * can never be forwarded to another origin by this verifier.
 */
export class FetchPublicEndpointVerifier implements PublicEndpointVerifier {
  readonly timeoutMs: number;

  constructor(timeoutMs = 10_000) {
    this.timeoutMs = timeoutMs;
  }

  async verify(input: PublicEndpointHealthInput): Promise<PublicEndpointHealthReport> {
    const base = safeUrl(input.publicUrl, input.allowHttp ?? false);
    const httpsBoundary = base.protocol === "https:" || Boolean(input.allowHttp);

    let authHealth = false;
    let restWithSecretKey = false;
    let apiKeyEnforcement = false;
    let authVersion: string | undefined;

    try {
      const response = await request(endpoint(base.toString(), "/auth/v1/health"), {
        method: "GET",
        headers: { apikey: input.publishableKey },
      }, this.timeoutMs);
      authHealth = response.status === 200;
      if (authHealth) {
        const payload = await response.json().catch(() => undefined) as { version?: unknown; name?: unknown } | undefined;
        if (payload && typeof payload.version === "string") authVersion = payload.version;
        if (payload?.name !== undefined && payload.name !== "GoTrue") authHealth = false;
      }
    } catch {
      authHealth = false;
    }

    try {
      const response = await request(endpoint(base.toString(), "/rest/v1/"), {
        method: "GET",
        headers: { apikey: input.secretKey },
      }, this.timeoutMs);
      restWithSecretKey = response.status === 200;
    } catch {
      restWithSecretKey = false;
    }

    try {
      const response = await request(endpoint(base.toString(), "/rest/v1/"), {
        method: "GET",
      }, this.timeoutMs);
      apiKeyEnforcement = response.status === 401;
    } catch {
      apiKeyEnforcement = false;
    }

    const checks = { httpsBoundary, authHealth, restWithSecretKey, apiKeyEnforcement };
    return {
      healthy: Object.values(checks).every(Boolean),
      checks,
      ...(authVersion ? { authVersion } : {}),
    };
  }
}
