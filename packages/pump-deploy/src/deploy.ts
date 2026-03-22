import { PumpSdk } from "@pump-fun/pump-sdk";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { DeployTriggerPayload } from "./trigger.js";
import { fetchImageAsBuffer, uploadTokenToPumpIpfs } from "./pumpIpfs.js";
import { grindVanityKeypair } from "./vanity.js";

export interface PumpDeployOptions {
  /** When true, simulate only; no chain write. */
  dryRun?: boolean;
  /** Skip pump.fun IPFS upload (dry-run only); uses dryRunMetadataUri. */
  skipIpfs?: boolean;
  dryRunMetadataUri?: string;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
  mayhemMode?: boolean;
}

export interface PumpDeployResult {
  mint: string;
  signature: string;
  dryRun: boolean;
}

const DEFAULT_DRY_RUN_METADATA_URI =
  "https://ipfs.io/ipfs/QmVYZ2KZ83ZMc377owduHAwmSXEeH2TLm9qaS4VXf5oYPu";

function resolveSkipVanity(trigger: DeployTriggerPayload, envDefault: boolean): boolean {
  if (trigger.skipVanityMint === true) return true;
  if (trigger.skipVanityMint === false) return false;
  return envDefault;
}

/**
 * Build and submit Pump.fun create v2 transaction (deployer = creator = user).
 */
export async function deployPumpCreate(
  connection: Connection,
  deployer: Keypair,
  trigger: DeployTriggerPayload,
  imageUrl: string,
  opts: PumpDeployOptions & {
    submitRawTransaction: (raw: Buffer) => Promise<string>;
  }
): Promise<PumpDeployResult> {
  const sdk = new PumpSdk();
  const deployerPub = deployer.publicKey;

  let metadataUri: string;
  if (opts.dryRun && opts.skipIpfs) {
    metadataUri = opts.dryRunMetadataUri ?? DEFAULT_DRY_RUN_METADATA_URI;
  } else {
    const { body, contentType, filename } = await fetchImageAsBuffer(imageUrl);
    const ipfs = await uploadTokenToPumpIpfs({
      imageBody: body,
      imageFilename: filename,
      imageContentType: contentType,
      name: trigger.name,
      symbol: trigger.ticker,
      description: trigger.description || " ",
      twitter: trigger.xCommunityUrl || undefined,
      website: trigger.websiteUrl || undefined,
      telegram: trigger.telegramUrl || undefined,
    });
    metadataUri = ipfs.metadataUri;
  }

  const vanityDefaultSkip =
    process.env.VANITY_DEFAULT_SKIP !== "0" && process.env.VANITY_DEFAULT_SKIP !== "false";
  const skipVanity = resolveSkipVanity(trigger, vanityDefaultSkip);
  const envSuffix = process.env.VANITY_SUFFIX?.trim().toLowerCase();
  let mint: Keypair;
  if (!skipVanity && trigger.vanitySuffix) {
    mint = await grindVanityKeypair(trigger.vanitySuffix);
  } else if (!skipVanity && envSuffix) {
    mint = await grindVanityKeypair(envSuffix);
  } else {
    mint = Keypair.generate();
  }

  const createIx = await sdk.createV2Instruction({
    mint: mint.publicKey,
    name: trigger.name,
    symbol: trigger.ticker,
    uri: metadataUri,
    creator: deployerPub,
    user: deployerPub,
    mayhemMode: opts.mayhemMode ?? false,
  });

  const tx = new Transaction();

  if (opts.computeUnitPriceMicroLamports != null && opts.computeUnitPriceMicroLamports > 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: BigInt(opts.computeUnitPriceMicroLamports),
      })
    );
  }
  if (opts.computeUnitLimit != null && opts.computeUnitLimit > 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: opts.computeUnitLimit,
      })
    );
  }

  tx.add(createIx);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = deployerPub;
  tx.partialSign(mint);
  tx.sign(deployer);

  if (opts.dryRun) {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      throw new Error(
        `Simulation failed: ${JSON.stringify(sim.value.err)} logs=${(sim.value.logs || []).join("\n")}`
      );
    }
    return {
      mint: mint.publicKey.toBase58(),
      signature: "dry-run",
      dryRun: true,
    };
  }

  const raw = tx.serialize();
  const signature = await opts.submitRawTransaction(Buffer.from(raw));
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return { mint: mint.publicKey.toBase58(), signature, dryRun: false };
}

export function loadDeployerKeypairFromEnv(): Keypair {
  const raw = process.env.DEPLOYER_KEYPAIR?.trim();
  if (!raw) {
    throw new Error("DEPLOYER_KEYPAIR is required (JSON array or base58 secret)");
  }
  try {
    const parsed = JSON.parse(raw) as number[];
    if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
  } catch {
    // base58
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}
