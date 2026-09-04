import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptJson, encryptJson } from "../lib/server/encryption";
import { pkceChallenge } from "../lib/server/oauth";
import { newSessionId, sessionLifetimeSeconds } from "../lib/server/session";
import { BINANCE_OAUTH_CLIENT_METADATA } from "../lib/server/client-metadata";

afterEach(() => vi.unstubAllEnvs());

describe("server-side OAuth security primitives", () => {
  it("produces the RFC 7636 S256 PKCE challenge", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("encrypts token payloads with session-bound authenticated encryption", () => {
    vi.stubEnv("TRADEGUARD_TOKEN_ENCRYPTION_KEY", "test-only-strong-encryption-key-material");
    const encrypted = encryptJson({ accessToken: "secret-token", expiresAt: 123 }, "session-a");
    expect(encrypted).not.toContain("secret-token");
    expect(decryptJson(encrypted, "session-a")).toEqual({ accessToken: "secret-token", expiresAt: 123 });
    expect(() => decryptJson(encrypted, "session-b")).toThrow();
  });

  it("creates opaque 256-bit browser session identifiers", () => {
    expect(newSessionId()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("retains only refresh-capable sessions beyond access-token expiry", () => {
    const expiresAt = Date.now() + 3_600_000;
    expect(sessionLifetimeSeconds({ accessToken: "a", tokenType: "Bearer", issuedAt: Date.now(), expiresAt })).toBeGreaterThanOrEqual(3_599);
    expect(sessionLifetimeSeconds({ accessToken: "a", refreshToken: "r", tokenType: "Bearer", issuedAt: Date.now(), expiresAt })).toBe(2_592_000);
  });
});

describe("OAuth client metadata", () => {
  it("declares the public URL client without secrets or invented scopes", () => {
    const payload: Record<string, unknown> = BINANCE_OAUTH_CLIENT_METADATA;
    expect(payload.client_id).toBe("https://tradeguard-rust.vercel.app/oauth/client-metadata.json");
    expect(payload.redirect_uris).toEqual(["https://tradeguard-rust.vercel.app/api/oauth/callback"]);
    expect(payload.grant_types).toEqual(["authorization_code"]);
    expect(payload.token_endpoint_auth_method).toBe("none");
    expect(payload).not.toHaveProperty("client_secret");
    expect(payload).not.toHaveProperty("scope");
  });
});
