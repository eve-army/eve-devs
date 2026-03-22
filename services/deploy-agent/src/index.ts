import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection } from "@solana/web3.js";
import {
  deployPumpCreate,
  IdempotencyStore,
  loadDeployerKeypairFromEnv,
  validateTrigger,
} from "@eve/pump-deploy";
import { verifyTriggerHmac } from "./hmac.js";
import { getFirstSignatureBase58, sendBundleViaJito } from "./jito.js";
import { notifyDeployCallback } from "./callback.js";

const HOST = process.env.DEPLOY_AGENT_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.DEPLOY_AGENT_PORT?.trim() || "4077");
const HMAC_SECRET = process.env.TRIGGER_HMAC_SECRET?.trim() || "";
const RPC_URL =
  process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
const DEFAULT_IMAGE_URL = process.env.DEFAULT_TOKEN_IMAGE_URL?.trim() || "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultIdempotencyPath = path.join(__dirname, "..", "data", "idempotency.json");

let deployQueue: Promise<unknown> = Promise.resolve();

/** Serialize deploy jobs; failures do not break subsequent triggers. */
function enqueueDeploy<T>(fn: () => Promise<T>): Promise<T> {
  const run = deployQueue.then(() => fn());
  deployQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function redactJsonForLog(raw: string): string {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const copy = { ...o, description: o.description ? "[redacted]" : o.description };
    return JSON.stringify(copy);
  } catch {
    return "[invalid json]";
  }
}

async function runDeploy(rawBody: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return { status: 400, body: { ok: false, error: "Invalid JSON" } };
  }

  const validated = validateTrigger(parsed, {
    requireImageUrl: !DEFAULT_IMAGE_URL,
  });
  if (!validated.ok) {
    return {
      status: 400,
      body: { ok: false, error: "Validation failed", details: validated.errors },
    };
  }

  const trigger = validated.value;
  const imageUrl = trigger.imageUrl ?? DEFAULT_IMAGE_URL;
  if (!imageUrl) {
    return {
      status: 400,
      body: { ok: false, error: "imageUrl or DEFAULT_TOKEN_IMAGE_URL required" },
    };
  }

  const storePath =
    process.env.IDEMPOTENCY_STORE_PATH?.trim() || defaultIdempotencyPath;
  const store = new IdempotencyStore(storePath);
  const idem = store.checkOrBegin(trigger.correlationId);
  if (!idem.proceed) {
    if (idem.reason === "duplicate" && idem.record.mint) {
      return {
        status: 200,
        body: {
          ok: true,
          duplicate: true,
          mint: idem.record.mint,
          signature: idem.record.signature,
        },
      };
    }
    return {
      status: 429,
      body: { ok: false, error: "Deploy already in progress for this correlationId" },
    };
  }

  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const skipIpfsDry =
    dryRun &&
    (process.env.DRY_RUN_SKIP_IPFS === "1" || process.env.DRY_RUN_SKIP_IPFS === "true");

  const connection = new Connection(RPC_URL, "confirmed");
  const deployer = loadDeployerKeypairFromEnv();

  const computeUnitPrice = process.env.COMPUTE_UNIT_PRICE_MICRO_LAMPORTS?.trim();
  const computeUnitLimit = process.env.COMPUTE_UNIT_LIMIT?.trim();
  const jitoUrl = process.env.JITO_BLOCK_ENGINE_URL?.trim();

  const submitRawTransaction = async (raw: Buffer): Promise<string> => {
    if (jitoUrl) {
      await sendBundleViaJito(jitoUrl, [raw.toString("base64")]);
      return getFirstSignatureBase58(raw);
    }
    return connection.sendRawTransaction(raw, {
      skipPreflight: process.env.SKIP_PREFLIGHT === "1",
      maxRetries: 5,
    });
  };

  try {
    const result = await deployPumpCreate(connection, deployer, trigger, imageUrl, {
      dryRun,
      skipIpfs: skipIpfsDry,
      computeUnitPriceMicroLamports: computeUnitPrice
        ? Number(computeUnitPrice)
        : undefined,
      computeUnitLimit: computeUnitLimit ? Number(computeUnitLimit) : undefined,
      submitRawTransaction,
    });

    store.set({
      correlationId: trigger.correlationId,
      status: "completed",
      mint: result.mint,
      signature: result.signature,
      updatedAt: new Date().toISOString(),
    });

    await notifyDeployCallback({
      correlationId: trigger.correlationId,
      ok: true,
      mint: result.mint,
      signature: result.signature,
      dryRun: result.dryRun,
    });

    return {
      status: 200,
      body: {
        ok: true,
        mint: result.mint,
        signature: result.signature,
        dryRun: result.dryRun,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    store.set({
      correlationId: trigger.correlationId,
      status: "failed",
      error: message,
      updatedAt: new Date().toISOString(),
    });
    await notifyDeployCallback({
      correlationId: trigger.correlationId,
      ok: false,
      error: message,
    });
    return { status: 500, body: { ok: false, error: message } };
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url?.split("?")[0] || "";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "POST" || url !== "/trigger") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    const rawBody = await readBody(req);
    const ts = req.headers["x-timestamp"] as string | undefined;
    const sig = req.headers["x-signature"] as string | undefined;
    const v = verifyTriggerHmac(HMAC_SECRET, rawBody, ts, sig);
    if (!v.ok) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: v.reason }));
      return;
    }

    console.log("[deploy-agent] TRIGGER accepted", redactJsonForLog(rawBody));

    const out = await enqueueDeploy(() => runDeploy(rawBody));

    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out.body));
  } catch (e) {
    console.error("[deploy-agent]", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Internal error" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[deploy-agent] listening on http://${HOST}:${PORT}`);
});
