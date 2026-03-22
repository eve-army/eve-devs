import { Keypair } from "@solana/web3.js";

/**
 * Grind a mint keypair whose public key ends with `suffix` (base58).
 * Yields to the event loop periodically to keep latency bounded for servers.
 */
export async function grindVanityKeypair(
  suffix: string,
  yieldEvery = 5000
): Promise<Keypair> {
  const s = suffix.toLowerCase();
  let attempts = 0;
  for (;;) {
    for (let i = 0; i < yieldEvery; i++) {
      const kp = Keypair.generate();
      if (kp.publicKey.toBase58().toLowerCase().endsWith(s)) return kp;
      attempts++;
    }
    await new Promise((r) => setImmediate(r));
  }
}
