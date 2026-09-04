import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { requireServerEnv } from "./config";

type Envelope = { v: 1; iv: string; tag: string; ciphertext: string };

function key(): Buffer {
  return createHash("sha256").update(requireServerEnv("TRADEGUARD_TOKEN_ENCRYPTION_KEY"), "utf8").digest();
}

export function encryptJson(value: unknown, associatedId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(associatedId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const envelope: Envelope = { v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
  return JSON.stringify(envelope);
}

export function decryptJson<T>(encoded: string, associatedId: string): T {
  const envelope = JSON.parse(encoded) as Partial<Envelope>;
  if (envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.ciphertext) throw new Error("Invalid encrypted session envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedId, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
