/**
 * Upload token image + metadata fields to Pump.fun's IPFS endpoint (same as site flow).
 */

export interface PumpIpfsResponse {
  metadata: Record<string, unknown>;
  metadataUri: string;
}

export interface PumpIpfsUploadParams {
  imageBody: Buffer;
  imageFilename: string;
  imageContentType: string;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  website?: string;
  telegram?: string;
}

export async function uploadTokenToPumpIpfs(
  params: PumpIpfsUploadParams,
  endpoint = "https://pump.fun/api/ipfs"
): Promise<PumpIpfsResponse> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.imageBody)], {
    type: params.imageContentType || "image/png",
  });
  form.append("file", blob, params.imageFilename);
  form.append("name", params.name);
  form.append("symbol", params.symbol);
  form.append("description", params.description);
  if (params.twitter) form.append("twitter", params.twitter);
  if (params.website) form.append("website", params.website);
  if (params.telegram) form.append("telegram", params.telegram);

  const res = await fetch(endpoint, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`pump.fun IPFS upload failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text) as PumpIpfsResponse;
  if (!data.metadataUri || typeof data.metadataUri !== "string") {
    throw new Error("pump.fun IPFS response missing metadataUri");
  }
  return data;
}

export async function fetchImageAsBuffer(
  imageUrl: string
): Promise<{ body: Buffer; contentType: string; filename: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}): ${imageUrl.slice(0, 80)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const body = Buffer.from(arrayBuf);
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const ext =
    contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "png";
  const filename = `token.${ext}`;
  return { body, contentType, filename };
}
