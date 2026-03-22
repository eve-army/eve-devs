import * as fs from "node:fs";
import * as path from "node:path";

export type DeployRecordStatus = "pending" | "completed" | "failed";

export interface DeployRecord {
  correlationId: string;
  status: DeployRecordStatus;
  mint?: string;
  signature?: string;
  error?: string;
  updatedAt: string;
}

interface StoreShape {
  records: Record<string, DeployRecord>;
}

function emptyStore(): StoreShape {
  return { records: {} };
}

function loadStore(filePath: string): StoreShape {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed.records || typeof parsed.records !== "object") return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function atomicWrite(filePath: string, data: StoreShape): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 0), "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * File-backed idempotency store (correlationId -> outcome).
 * Safe enough for a single-process agent; use Redis if you scale horizontally.
 */
export class IdempotencyStore {
  constructor(private readonly filePath: string) {}

  get(correlationId: string): DeployRecord | undefined {
    const store = loadStore(this.filePath);
    return store.records[correlationId];
  }

  set(record: DeployRecord): void {
    const store = loadStore(this.filePath);
    store.records[record.correlationId] = record;
    atomicWrite(this.filePath, store);
  }

  /**
   * If correlationId already completed, returns duplicate.
   * If pending, another deploy is in flight (reject with in_flight).
   * If failed or missing, mark pending and proceed.
   */
  checkOrBegin(
    correlationId: string
  ):
    | { proceed: true }
    | { proceed: false; record: DeployRecord; reason: "duplicate" | "in_flight" } {
    const existing = this.get(correlationId);
    if (existing?.status === "completed" && existing.mint) {
      return { proceed: false, record: existing, reason: "duplicate" };
    }
    if (existing?.status === "pending") {
      return { proceed: false, record: existing, reason: "in_flight" };
    }
    this.set({
      correlationId,
      status: "pending",
      updatedAt: new Date().toISOString(),
    });
    return { proceed: true };
  }
}
