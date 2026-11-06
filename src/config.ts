export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface AppConfig {
  evccUrl: string;
  targetSoc: number;
  maxDurationMinutes: number;
  noProgressTimeoutMinutes: number;
  httpTimeoutMs: number;
  dryRun: boolean;
  /** Read from the environment only. Never log this value. */
  apiKey: string;
}

type Env = Record<string, string | undefined>;

const DEFAULTS = {
  maxDurationMinutes: 120,
  noProgressTimeoutMinutes: 30,
  httpTimeoutMs: 5000,
  dryRun: false,
};

function positiveNumber(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key] ?? fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`${key} must be a number greater than 0 (got ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * Validates a parsed config file object and the environment, and returns the
 * typed configuration. Throws ConfigError naming the offending key. Never
 * includes secret values in error messages.
 */
export function loadConfig(raw: unknown, env: Env = process.env): AppConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError("config must be a JSON object");
  }
  const file = raw as Record<string, unknown>;

  const evccUrl = file.evccUrl;
  if (typeof evccUrl !== "string" || evccUrl.trim() === "") {
    throw new ConfigError("evccUrl is required");
  }

  const targetSoc = file.targetSoc;
  if (typeof targetSoc !== "number" || !Number.isFinite(targetSoc) || targetSoc < 0 || targetSoc > 100) {
    throw new ConfigError(`targetSoc must be between 0 and 100 (got ${JSON.stringify(targetSoc)})`);
  }

  const apiKey = env.EVCC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new ConfigError("EVCC_API_KEY environment variable is required");
  }

  return {
    evccUrl: evccUrl.trim(),
    targetSoc,
    maxDurationMinutes: positiveNumber(file, "maxDurationMinutes", DEFAULTS.maxDurationMinutes),
    noProgressTimeoutMinutes: positiveNumber(file, "noProgressTimeoutMinutes", DEFAULTS.noProgressTimeoutMinutes),
    httpTimeoutMs: positiveNumber(file, "httpTimeoutMs", DEFAULTS.httpTimeoutMs),
    dryRun: file.dryRun === undefined ? DEFAULTS.dryRun : file.dryRun === true,
    apiKey: apiKey.trim(),
  };
}
