/**
 * Optional Jito Block Engine JSON-RPC `sendBundle`.
 * @see https://docs.jito.wtf/
 */

import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

export function getFirstSignatureBase58(rawTx: Buffer): string {
  const tx = Transaction.from(rawTx);
  for (const s of tx.signatures) {
    if (s.signature) return bs58.encode(s.signature);
  }
  throw new Error("No signatures on serialized transaction");
}

export interface JitoSendResult {
  bundleId: string;
}

export async function sendBundleViaJito(
  blockEngineBaseUrl: string,
  transactionsBase64: string[]
): Promise<JitoSendResult> {
  const url = `${blockEngineBaseUrl.replace(/\/$/, "")}/api/v1/bundles`;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [transactionsBase64],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { result?: string; error?: { message?: string } };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`Jito response not JSON (${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok || json.error) {
    throw new Error(
      `Jito sendBundle failed (${res.status}): ${json.error?.message ?? text.slice(0, 400)}`
    );
  }
  if (!json.result || typeof json.result !== "string") {
    throw new Error(`Jito sendBundle missing result: ${text.slice(0, 400)}`);
  }
  return { bundleId: json.result };
}
