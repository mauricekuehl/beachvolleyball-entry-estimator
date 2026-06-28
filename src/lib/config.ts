export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigurationError(`${name} is not configured.`, "MISSING_CONFIGURATION");
  }
  return value;
}

export function getAppBaseUrl(): string {
  return requireEnv("APP_BASE_URL").replace(/\/+$/, "");
}
