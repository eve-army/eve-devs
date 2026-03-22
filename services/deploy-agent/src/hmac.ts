import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SEC = 300;

export function verifyTriggerHmac(
  secret: string,
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHex: string | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "Server misconfigured: missing secret" };
  if (!timestampHeader || !signatureHex) {
    return { ok: false, reason: "Missing X-Timestamp or X-Signature" };
  }
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || ts < 1) {
    return { ok: false, reason: "Invalid X-Timestamp" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) {
    return { ok: false, reason: "Timestamp outside allowed window" };
  }
  const payload = `${timestampHeader}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest();
  let sig: Buffer;
  try {
    sig = Buffer.from(signatureHex.trim(), "hex");
  } catch {
    return { ok: false, reason: "Invalid signature encoding" };
  }
  if (sig.length !== expected.length) {
    return { ok: false, reason: "Invalid signature" };
  }
  if (!timingSafeEqual(sig, expected)) {
    return { ok: false, reason: "Invalid signature" };
  }
  return { ok: true };
}

export function signTriggerBody(secret: string, rawBody: string, timestampSec = Math.floor(Date.now() / 1000)): { timestamp: string; signature: string } {
  const timestamp = String(timestampSec);
  const payload = `${timestamp}.${rawBody}`;
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return { timestamp, signature };
}
