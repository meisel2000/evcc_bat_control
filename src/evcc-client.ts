export interface EvccState {
  batteryMode: string;
  batterySoc: number;
}

export interface EvccClient {
  getState(): Promise<EvccState>;
  setChargeMode(): Promise<void>;
}

export interface EvccClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

/**
 * Minimal evcc REST client. Sends the API key only as a bearer token and never
 * includes it in error messages.
 */
export function createEvccClient(opts: EvccClientOptions): EvccClient {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${opts.apiKey}` };

  async function request(method: "GET" | "POST", path: string): Promise<Response> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`evcc ${method} ${path} failed with HTTP ${res.status}`);
    }
    return res;
  }

  return {
    async getState() {
      const res = await request("GET", "/state");
      const body = (await res.json()) as { batteryMode: string; battery: { soc: number } };
      return { batteryMode: body.batteryMode, batterySoc: body.battery.soc };
    },
    async setChargeMode() {
      await request("POST", "/batterymode/charge");
    },
  };
}
