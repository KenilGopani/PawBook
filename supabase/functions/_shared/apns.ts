/**
 * APNs (Apple Push Notification service) HTTP/2 client.
 *
 * Uses provider (JWT) authentication — see
 * https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
 *
 * Environment variables required:
 *   APNS_TEAM_ID      — Apple Developer Team ID (10 chars)
 *   APNS_KEY_ID       — Key ID of the .p8 Auth Key
 *   APNS_PRIVATE_KEY  — Contents of the .p8 file (PEM, PKCS8 EC private key)
 *   APNS_BUNDLE_ID    — iOS app bundle identifier (used as apns-topic)
 *   APNS_ENV          — "production" (default) or "sandbox"
 *
 * See: 09_service_alerts.md — "Push Notification Payloads (APNs)"
 */

export class ApnsInvalidTokenError extends Error {
  constructor(public deviceToken: string, message: string) {
    super(message);
    this.name = "ApnsInvalidTokenError";
  }
}

export interface ApnsPayload {
  aps: {
    alert: { title: string; body: string };
    sound?: string;
    badge?: number;
    category?: string;
  };
  [key: string]: unknown;
}

// ─── base64url helpers ────────────────────────────────────

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem
    .replace(/-----BEGIN (EC )?PRIVATE KEY-----/, "")
    .replace(/-----END (EC )?PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Provider (JWT) token, cached for its ~1h validity ────

let cachedToken: { jwt: string; issuedAt: number } | null = null;
const TOKEN_TTL_MS = 55 * 60 * 1000; // Apple tokens are valid 1h; refresh a bit early

/**
 * Build (and cache) the ES256 provider authentication JWT required on
 * every APNs request. Exposed for testing — pass explicit config to avoid
 * depending on Deno.env.
 */
export async function buildProviderToken(config: {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  now?: number;
}): Promise<string> {
  const now = config.now ?? Date.now();

  if (cachedToken && now - cachedToken.issuedAt < TOKEN_TTL_MS) {
    return cachedToken.jwt;
  }

  const header = { alg: "ES256", kid: config.keyId };
  const claims = { iss: config.teamId, iat: Math.floor(now / 1000) };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;
  cachedToken = { jwt, issuedAt: now };
  return jwt;
}

function apnsHost(env: string | undefined): string {
  return env === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

/**
 * Send a single push notification via the APNs HTTP/2 API.
 * Throws ApnsInvalidTokenError for tokens that should be removed
 * (BadDeviceToken / Unregistered), and a plain Error for anything else.
 */
export async function sendApnsPush(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<void> {
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const privateKeyPem = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");

  if (!teamId || !keyId || !privateKeyPem || !bundleId) {
    throw new Error(
      "APNs not configured (APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID)",
    );
  }

  const jwt = await buildProviderToken({ teamId, keyId, privateKeyPem });
  const host = apnsHost(Deno.env.get("APNS_ENV"));

  const response = await fetch(`${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) return;

  const text = await response.text();
  if (response.status === 400 || response.status === 410) {
    // BadDeviceToken, Unregistered, DeviceTokenNotForTopic — caller should
    // delete the stored token.
    throw new ApnsInvalidTokenError(
      deviceToken,
      `APNs rejected token (${response.status}): ${text}`,
    );
  }
  throw new Error(`APNs push failed (${response.status}): ${text}`);
}

// ─── Payload builders matching 09_service_alerts.md exactly ──
//
// users_within_radius() only returns matching user ids, not a per-user
// distance, so the copy names the search radius ("within 3km") rather
// than fabricating a precise per-recipient distance.

export function buildLostPetPushPayload(args: {
  alertId: string;
  petName: string;
  breed: string | null;
  radiusKm: number;
}): ApnsPayload {
  const breedPart = args.breed ? ` (${args.breed})` : "";
  return {
    aps: {
      alert: {
        title: "🚨 Lost Pet Nearby",
        body:
          `${args.petName}${breedPart} was last seen within ${args.radiusKm}km of you. Can you help?`,
      },
      sound: "default",
      badge: 1,
      category: "LOST_PET",
    },
    alert_id: args.alertId,
    type: "LOST_PET_NEARBY",
  };
}

export function buildCommunityAlertPushPayload(args: {
  alertId: string;
  description: string;
  radiusKm: number;
}): ApnsPayload {
  return {
    aps: {
      alert: {
        title: "⚠️ Safety Alert Nearby",
        body: `${args.description} Reported within ${args.radiusKm}km of you. Stay alert.`,
      },
      sound: "default",
      category: "COMMUNITY_ALERT",
    },
    alert_id: args.alertId,
    type: "COMMUNITY_ALERT",
  };
}
