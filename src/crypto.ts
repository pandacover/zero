import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hostname, userInfo } from "node:os";

/**
 * Derives a consistent machine/user-level master encryption key.
 * Can be overridden via ZERO_ENCRYPTION_KEY environment variable.
 */
function getMasterKey(): Buffer {
  const customKey = process.env.ZERO_ENCRYPTION_KEY;
  if (customKey && customKey.length >= 16) {
    return scryptSync(customKey, "zero-salt-static", 32);
  }

  let machineIdentifier = "zero-agent-default-secret";
  try {
    const user = userInfo().username || "default-user";
    const host = hostname() || "localhost";
    machineIdentifier = `${user}@${host}:zero-agent-key`;
  } catch {
    // Fallback if OS userInfo fails
  }

  return scryptSync(machineIdentifier, "zero-storage-salt", 32);
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: iv:authTag:encryptedHex
 */
export function encrypt(text: string): string {
  if (!text) return "";
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf-8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with AES-256-GCM.
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) return "";

  // If plain text (not matching iv:tag:cipher format), return as is for backwards compatibility
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    return encryptedData;
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (!ivHex || !authTagHex || !cipherHex) {
    return encryptedData;
  }

  try {
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (err: any) {
    // If decryption fails, return empty or throw clear error
    return "";
  }
}
