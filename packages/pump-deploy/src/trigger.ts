/**
 * TRIGGER payload: single message from eve-core after eve-social supplies X link.
 * @see docs/TRIGGER.md
 */

export const TRIGGER_SCHEMA_VERSION = 1 as const;

/** UUID v4 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DeployTriggerPayload {
  schemaVersion: typeof TRIGGER_SCHEMA_VERSION;
  correlationId: string;
  name: string;
  ticker: string;
  description: string;
  xCommunityUrl: string;
  /** Public HTTPS URL to token image. Omit only if caller relies on default image env on the agent. */
  imageUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  /** When true, skip vanity mint grinding (faster). Default on agent: true. */
  skipVanityMint?: boolean;
  /** Suffix for vanity mint (e.g. "eve"). Ignored when skipVanityMint is true. */
  vanitySuffix?: string;
}

export interface TriggerValidationError {
  field: string;
  message: string;
}

const MAX_NAME = 32;
const MAX_TICKER = 10;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 2048;

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpOrHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validates TRIGGER body. `xCommunityUrl` may be empty string if not yet known (caller should avoid deploying).
 */
export function validateTrigger(
  body: unknown,
  opts?: { requireImageUrl?: boolean }
): { ok: true; value: DeployTriggerPayload } | { ok: false; errors: TriggerValidationError[] } {
  const errors: TriggerValidationError[] = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: [{ field: "_", message: "Body must be a JSON object" }] };
  }
  const o = body as Record<string, unknown>;

  if (o.schemaVersion !== TRIGGER_SCHEMA_VERSION) {
    errors.push({
      field: "schemaVersion",
      message: `Expected ${TRIGGER_SCHEMA_VERSION}`,
    });
  }

  const correlationId = typeof o.correlationId === "string" ? o.correlationId.trim() : "";
  if (!UUID_RE.test(correlationId)) {
    errors.push({ field: "correlationId", message: "Must be a UUID v4" });
  }

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > MAX_NAME) {
    errors.push({
      field: "name",
      message: `Required, max ${MAX_NAME} characters`,
    });
  }

  const ticker = typeof o.ticker === "string" ? o.ticker.trim().toUpperCase() : "";
  if (!ticker || ticker.length > MAX_TICKER) {
    errors.push({
      field: "ticker",
      message: `Required, max ${MAX_TICKER} characters`,
    });
  }

  const description = typeof o.description === "string" ? o.description.trim() : "";
  if (description.length > MAX_DESCRIPTION) {
    errors.push({
      field: "description",
      message: `Max ${MAX_DESCRIPTION} characters`,
    });
  }

  const xCommunityUrl = typeof o.xCommunityUrl === "string" ? o.xCommunityUrl.trim() : "";
  if (xCommunityUrl.length > MAX_URL) {
    errors.push({ field: "xCommunityUrl", message: `Max ${MAX_URL} characters` });
  } else if (xCommunityUrl && !isHttpOrHttpsUrl(xCommunityUrl)) {
    errors.push({ field: "xCommunityUrl", message: "Must be a valid http(s) URL when set" });
  }

  let imageUrl: string | undefined;
  if (o.imageUrl !== undefined && o.imageUrl !== null) {
    if (typeof o.imageUrl !== "string" || !o.imageUrl.trim()) {
      errors.push({ field: "imageUrl", message: "Must be a non-empty string when provided" });
    } else {
      imageUrl = o.imageUrl.trim();
      if (imageUrl.length > MAX_URL) {
        errors.push({ field: "imageUrl", message: `Max ${MAX_URL} characters` });
      } else if (!isHttpsUrl(imageUrl)) {
        errors.push({ field: "imageUrl", message: "Must be a valid https URL" });
      }
    }
  }

  if (opts?.requireImageUrl && !imageUrl) {
    errors.push({ field: "imageUrl", message: "Required when no default image is configured" });
  }

  let websiteUrl = "";
  if (o.websiteUrl != null) {
    if (typeof o.websiteUrl !== "string") {
      errors.push({ field: "websiteUrl", message: "Must be a string" });
    } else {
      websiteUrl = o.websiteUrl.trim();
      if (websiteUrl && !isHttpOrHttpsUrl(websiteUrl)) {
        errors.push({ field: "websiteUrl", message: "Must be http(s) when set" });
      }
    }
  }

  let telegramUrl = "";
  if (o.telegramUrl != null) {
    if (typeof o.telegramUrl !== "string") {
      errors.push({ field: "telegramUrl", message: "Must be a string" });
    } else {
      telegramUrl = o.telegramUrl.trim();
      if (telegramUrl && !isHttpOrHttpsUrl(telegramUrl)) {
        errors.push({ field: "telegramUrl", message: "Must be http(s) when set" });
      }
    }
  }

  const skipVanityMint = o.skipVanityMint === true;
  const vanitySuffix =
    typeof o.vanitySuffix === "string" && o.vanitySuffix.length > 0
      ? o.vanitySuffix.trim().toLowerCase()
      : undefined;
  if (vanitySuffix && vanitySuffix.length > 8) {
    errors.push({ field: "vanitySuffix", message: "Max 8 characters" });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: TRIGGER_SCHEMA_VERSION,
      correlationId,
      name,
      ticker,
      description,
      xCommunityUrl,
      imageUrl,
      websiteUrl,
      telegramUrl,
      skipVanityMint,
      vanitySuffix,
    },
  };
}
