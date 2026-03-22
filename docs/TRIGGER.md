# TRIGGER payload (`schemaVersion` 1)

Single JSON message from **eve-core** after **eve-social** has supplied the X community link. One TRIGGER → at most one on-chain create (idempotent by `correlationId`).

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `schemaVersion` | `1` | yes | Must be literal `1`. |
| `correlationId` | string (UUID v4) | yes | Idempotency key; completed deploys are not repeated. |
| `name` | string | yes | Max 32 characters. |
| `ticker` | string | yes | Max 10 characters; normalized to uppercase on deploy. |
| `description` | string | yes | Max 2000 characters; may be empty. |
| `xCommunityUrl` | string | no* | `http`/`https` when set; maps to Pump metadata `twitter`. |
| `imageUrl` | string (https) | no* | Public image URL; required unless agent has `DEFAULT_TOKEN_IMAGE_URL`. |
| `websiteUrl` | string | no | `http`/`https` when non-empty. |
| `telegramUrl` | string | no | `http`/`https` when non-empty. |
| `skipVanityMint` | boolean | no | When `true`, mint is random (faster). Agent defaults to skipping vanity unless overridden. |
| `vanitySuffix` | string | no | Base58 suffix to grind (max 8 chars); only used when vanity is not skipped. |

\* Agent validates `imageUrl` / default image at runtime.

## Example

```json
{
  "schemaVersion": 1,
  "correlationId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "name": "Example Coin",
  "ticker": "EXMP",
  "description": "Deployed via eve-core TRIGGER.",
  "xCommunityUrl": "https://x.com/i/communities/123456789",
  "imageUrl": "https://example.com/token.png",
  "websiteUrl": "",
  "telegramUrl": "",
  "skipVanityMint": true
}
```

## Transport

Send to the deploy agent over **loopback** with **HMAC** (see `services/deploy-agent` README). Do not expose raw TRIGGER payloads on public URLs or query strings.
