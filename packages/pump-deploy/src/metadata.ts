import type { DeployTriggerPayload } from "./trigger.js";

/** Pump.fun-compatible token metadata JSON (mirrors OpenClawLaunch). */
export interface PumpTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter: string;
  telegram: string;
  website: string;
}

export function buildPumpMetadata(
  trigger: DeployTriggerPayload,
  imageUrl: string
): PumpTokenMetadata {
  return {
    name: trigger.name,
    symbol: trigger.ticker,
    description: trigger.description || " ",
    image: imageUrl,
    showName: true,
    createdOn: "https://pump.fun",
    twitter: trigger.xCommunityUrl || "",
    telegram: trigger.telegramUrl || "",
    website: trigger.websiteUrl || "",
  };
}

export function serializeMetadata(meta: PumpTokenMetadata): string {
  return JSON.stringify(meta);
}
