import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  base64url,
  buildCommunityAlertPushPayload,
  buildLostPetPushPayload,
  buildProviderToken,
} from "./apns.ts";

function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    input.length + ((4 - (input.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateTestKeyPem(): Promise<{ privateKeyPem: string; publicKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${
    b64.match(/.{1,64}/g)!.join("\n")
  }\n-----END PRIVATE KEY-----`;
  return { privateKeyPem: pem, publicKey: keyPair.publicKey };
}

Deno.test("base64url has no padding and no +/ characters", () => {
  const encoded = base64url("hello world??");
  assert(!encoded.includes("+"));
  assert(!encoded.includes("/"));
  assert(!encoded.includes("="));
});

Deno.test("buildProviderToken produces a valid, verifiable ES256 JWT", async () => {
  const { privateKeyPem, publicKey } = await generateTestKeyPem();

  const jwt = await buildProviderToken({
    teamId: "TESTTEAM12",
    keyId: "TESTKEYID1",
    privateKeyPem,
    now: 1_700_000_000_000,
  });

  const [headerB64, claimsB64, sigB64] = jwt.split(".");
  assert(headerB64 && claimsB64 && sigB64, "JWT must have 3 segments");

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(claimsB64)));

  assertEquals(header, { alg: "ES256", kid: "TESTKEYID1" });
  assertEquals(claims.iss, "TESTTEAM12");
  assertEquals(claims.iat, 1_700_000_000);

  const signingInput = new TextEncoder().encode(`${headerB64}.${claimsB64}`);
  const signature = base64urlDecode(sigB64);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    signingInput,
  );
  assert(valid, "APNs provider token signature must verify against the matching public key");
});

Deno.test("buildProviderToken caches the token within its TTL", async () => {
  // Cache is a module-level singleton keyed only by elapsed time, so this
  // uses a `now` far from the other test in this file to avoid an
  // accidental cache hit carried over from it.
  const { privateKeyPem } = await generateTestKeyPem();
  const config = { teamId: "TESTTEAM12", keyId: "TESTKEYID1", privateKeyPem };

  const first = await buildProviderToken({ ...config, now: 9_000_000_000_000 });
  const second = await buildProviderToken({ ...config, now: 9_000_000_000_000 + 60_000 });

  assertEquals(first, second);
});

Deno.test("buildLostPetPushPayload matches the 09_service_alerts.md shape", () => {
  const payload = buildLostPetPushPayload({
    alertId: "alert-1",
    petName: "Max",
    breed: "Golden Retriever",
    radiusKm: 3,
  });

  assertEquals(payload.aps.category, "LOST_PET");
  assertEquals(payload.aps.sound, "default");
  assertEquals(payload.aps.badge, 1);
  assertEquals(payload.type, "LOST_PET_NEARBY");
  assertEquals(payload.alert_id, "alert-1");
  assert(payload.aps.alert.body.includes("Max"));
  assert(payload.aps.alert.body.includes("Golden Retriever"));
});

Deno.test("buildLostPetPushPayload omits breed parens when breed is null", () => {
  const payload = buildLostPetPushPayload({
    alertId: "alert-1",
    petName: "Max",
    breed: null,
    radiusKm: 3,
  });
  assertEquals(payload.aps.alert.body.includes("("), false);
});

Deno.test("buildCommunityAlertPushPayload matches the 09_service_alerts.md shape", () => {
  const payload = buildCommunityAlertPushPayload({
    alertId: "alert-2",
    description: "Aggressive off-leash dog reported",
    radiusKm: 2,
  });

  assertEquals(payload.aps.category, "COMMUNITY_ALERT");
  assertEquals(payload.aps.badge, undefined);
  assertEquals(payload.type, "COMMUNITY_ALERT");
  assert(payload.aps.alert.body.includes("Aggressive off-leash dog reported"));
});
