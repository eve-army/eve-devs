import { signTriggerBody } from "./hmac.js";

export interface DeployCallbackPayload {
  correlationId: string;
  ok: boolean;
  mint?: string;
  signature?: string;
  dryRun?: boolean;
  error?: string;
}

export async function notifyDeployCallback(payload: DeployCallbackPayload): Promise<void> {
  const url = process.env.DEPLOY_CALLBACK_URL?.trim();
  if (!url) return;

  const secret = process.env.DEPLOY_CALLBACK_HMAC_SECRET?.trim();
  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    const { timestamp, signature } = signTriggerBody(secret, rawBody);
    headers["X-Timestamp"] = timestamp;
    headers["X-Signature"] = signature;
  }

  const res = await fetch(url, { method: "POST", headers, body: rawBody });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[deploy-agent] callback failed", res.status, t.slice(0, 300));
  }
}
