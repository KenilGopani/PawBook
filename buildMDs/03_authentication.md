# PawBook — Authentication & Authorization

## Overview

Authentication is handled entirely by **Supabase Auth**. The iOS app uses the Supabase Swift SDK for all auth flows. JWTs issued by Supabase are passed as `Authorization: Bearer <token>` on every API request. Row-Level Security (RLS) in PostgreSQL enforces authorization at the database layer — not just at the API layer.

---

## Auth Methods Supported

| Method | Priority | Notes |
|---|---|---|
| Apple Sign-In | Primary | Required by Apple for iOS apps with social login |
| Email + Password | Secondary | Fallback for non-Apple users |
| Google OAuth | Future | Not in MVP |

---

## Flow 1 — Apple Sign-In (Primary)

### Sequence
```
iOS App
  1. Trigger ASAuthorizationAppleIDProvider
  2. User authenticates with Face ID / Touch ID
  3. Apple returns: identityToken (JWT), authorizationCode, user.email, user.fullName
  4. App calls supabase.auth.signInWithIdToken(provider: .apple, idToken: identityToken)
  5. Supabase verifies token with Apple's public keys
  6. Supabase issues its own JWT (access_token + refresh_token)
  7. DB trigger fires: creates profiles row for new user
  8. App stores tokens in iOS Keychain (via Supabase SDK)
  9. App navigates to onboarding (if new user) or home feed
```

### iOS Implementation
```swift
import AuthenticationServices
import Supabase

func signInWithApple() async throws {
    let provider = ASAuthorizationAppleIDProvider()
    let request = provider.createRequest()
    request.requestedScopes = [.fullName, .email]

    let result = try await withCheckedThrowingContinuation { continuation in
        // ASAuthorizationController delegate pattern
    }

    guard let idToken = result.credential.identityToken,
          let tokenString = String(data: idToken, encoding: .utf8) else {
        throw AuthError.missingToken
    }

    let session = try await supabase.auth.signInWithIdToken(
        credentials: .init(
            provider: .apple,
            idToken: tokenString
        )
    )
    // session.accessToken and session.refreshToken now stored by SDK
}
```

### Supabase Configuration
In Supabase Dashboard → Authentication → Providers → Apple:
- Enable Apple provider
- Set `Services ID` (from Apple Developer)
- Set `Secret Key` (generated from Apple Developer `.p8` file)

---

## Flow 2 — Email + Password

### Sign Up
```
POST /auth/v1/signup  (Supabase Auth endpoint — called via SDK)

Request (via SDK):
{
  email: "user@example.com",
  password: "minimum8chars",
  options: {
    data: {
      full_name: "Jane Smith"    // stored in auth.users.raw_user_meta_data
    }
  }
}

Response:
{
  user: { id, email, created_at },
  session: { access_token, refresh_token, expires_in }
}

Side effect: DB trigger creates profiles row
```

### Sign In
```
POST /auth/v1/token?grant_type=password  (via SDK)

Request:
{ email, password }

Response:
{ access_token, refresh_token, expires_in, token_type: "bearer" }
```

### Password Reset
```
POST /auth/v1/recover  (via SDK)

Request: { email }
Response: { } 204

-- Supabase sends a reset email with a magic link
-- On link tap, iOS app receives deep link: pawbook://reset-password?token=xxx
-- App calls supabase.auth.updateUser(password: newPassword)
```

---

## JWT Structure

Supabase JWTs are standard RS256-signed tokens.

```json
// Header
{ "alg": "RS256", "typ": "JWT" }

// Payload
{
  "sub": "uuid-of-auth-user",       // auth.users.id — also profiles.id
  "aud": "authenticated",
  "role": "authenticated",
  "email": "user@example.com",
  "iat": 1700000000,
  "exp": 1700003600,                // 1 hour expiry
  "app_metadata": {},
  "user_metadata": {
    "full_name": "Jane Smith"
  }
}
```

Key point: `auth.uid()` in PostgreSQL RLS policies resolves to the `sub` claim. This is how RLS knows who is making the request.

---

## Token Lifecycle

| Token | Expiry | Storage |
|---|---|---|
| Access token | 1 hour | iOS Keychain (via Supabase SDK) |
| Refresh token | 30 days | iOS Keychain (via Supabase SDK) |

### Auto-Refresh (iOS)
The Supabase Swift SDK handles token refresh automatically. When the access token is within 60 seconds of expiry, the SDK calls the refresh endpoint and updates the Keychain silently.

```swift
// SDK handles this automatically — no manual refresh needed
// Just always use: supabase.auth.session?.accessToken
```

### Token Revocation (Sign Out)
```swift
try await supabase.auth.signOut()
// SDK clears Keychain, calls /auth/v1/logout server-side
// Server invalidates refresh token in auth.refresh_tokens table
```

---

## Authorization Model

### Layers (in order of enforcement)

```
Layer 1 — Supabase Auth (JWT validation)
  Every request must carry a valid JWT.
  Supabase validates signature, expiry, and audience automatically.

Layer 2 — RLS Policies (PostgreSQL)
  Every table has RLS enabled.
  Policies use auth.uid() to restrict rows.
  This is the primary authorization layer — cannot be bypassed.

Layer 3 — Edge Function guards (business logic)
  Used for complex rules that can't be expressed in RLS alone.
  Example: "only invite a pet to a meetup if they are friends"
```

### Authorization Rules Summary

| Resource | Read | Write | Delete |
|---|---|---|---|
| Profile | Anyone (active profiles) | Owner only | Soft-delete by owner |
| Pet | Anyone (active pets) | Owner only | Soft-delete by owner |
| Vaccination record | Owner (all) + Public (verified only) | Owner only | Owner only |
| Post | Anyone (active posts) | Pet owner only | Soft-delete by pet owner |
| Comment | Anyone (active comments) | Pet owner only | Soft-delete by author |
| Post reaction | Anyone | Pet owner only | Pet owner only |
| Pet relationship | Both sides' owners | Initiating owner | Either owner |
| Meetup | Organizer + participants | Organizer only | Organizer (cancel only) |
| Meetup participant | Organizer + that participant's owner | Organizer (invite) | That participant's owner (RSVP decline) |
| Place | Anyone (active places) | Any auth user (add) | Adder only |
| Place review | Anyone | Auth user (one per place) | Author only |
| Notification | Recipient only | System only (Edge Function) | Recipient only |
| Lost pet alert | Anyone (active alerts) | Reporter only | Reporter only |
| Community alert | Anyone (active, non-expired) | Auth user | Reporter only |
| Report | Reporter only | Auth user | — |

---

## Onboarding State Machine

After first login, the app checks onboarding completion before routing.

```
New user signs in
  └── profiles.display_name set? → No → Screen: Set display name
  └── Has at least one pet? → No → Screen: Add first pet
  └── profiles.location set? → No → Screen: Allow location (optional)
  └── → Home feed
```

```swift
func checkOnboardingState() async -> OnboardingStep {
    let profile = try await supabase
        .from("profiles")
        .select("display_name, location, city")
        .eq("id", value: userId)
        .single()
        .execute()

    let pets = try await supabase
        .from("pets")
        .select("id")
        .eq("owner_id", value: userId)
        .execute()

    if profile.displayName == nil { return .setName }
    if pets.isEmpty { return .addPet }
    return .complete
}
```

---

## Session Persistence (iOS)

```swift
// On app launch — restore existing session
let session = try? await supabase.auth.session

if session != nil {
    // Valid session — go to home
} else {
    // No session — go to login screen
}

// Listen for auth state changes
for await state in supabase.auth.authStateChanges {
    switch state.event {
    case .signedIn:   router.navigate(to: .home)
    case .signedOut:  router.navigate(to: .login)
    case .tokenRefreshed: break  // silent, SDK handled it
    default: break
    }
}
```

---

## Edge Function Auth (Server-Side)

Edge Functions receive the user's JWT via the `Authorization` header. They create a Supabase client with that token so their DB queries respect RLS.

```typescript
// Supabase Edge Function — standard auth pattern
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Create client scoped to the requesting user
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // All DB queries now run under RLS for this user
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", (await supabase.auth.getUser()).data.user?.id)
    .single();

  // For Neo4j calls — use service role (no RLS needed, graph DB)
  const adminSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" }
  });
});
```

---

## Security Checklist

- [ ] RLS enabled on every table (enforced — never disabled for convenience)
- [ ] Service role key never shipped to iOS client (server/Edge Functions only)
- [ ] Anon key in iOS app is safe — it cannot bypass RLS
- [ ] Apple Sign-In identity token verified by Supabase (not trusted client-side)
- [ ] Refresh tokens stored in iOS Keychain (never UserDefaults)
- [ ] Deep link handlers for password reset validate token before accepting
- [ ] Profile location stored at city-level by default; precise coords are opt-in
- [ ] All writes to `reports` table routed through Edge Function to prevent spam
- [ ] Neo4j credentials never exposed to iOS client — Edge Function proxy only

---

## Error Responses (Auth-specific)

| Scenario | HTTP Status | Error Code | Message |
|---|---|---|---|
| Missing Authorization header | 401 | `AUTH_MISSING` | Authorization header required |
| Expired access token | 401 | `AUTH_EXPIRED` | Token expired — refresh required |
| Invalid token signature | 401 | `AUTH_INVALID` | Invalid token |
| Insufficient permissions (RLS) | 403 | `AUTH_FORBIDDEN` | You do not have access to this resource |
| Apple token verification failed | 401 | `AUTH_APPLE_FAILED` | Apple identity verification failed |

All error responses follow the standard format defined in `11_api_conventions.md`.
