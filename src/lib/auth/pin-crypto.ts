import crypto from "node:crypto";

export const PARENT_PIN_MIN_LENGTH = 4;
export const PARENT_PIN_MAX_LENGTH = 32;

export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateParentPinFormat(
  pin: string
): { ok: true; normalized: string } | { ok: false; error: string } {
  const normalized = pin.trim();
  if (!normalized) {
    return { ok: false, error: "家长密码不能为空" };
  }
  if (normalized.length < PARENT_PIN_MIN_LENGTH) {
    return { ok: false, error: `家长密码至少需要 ${PARENT_PIN_MIN_LENGTH} 位字符` };
  }
  if (normalized.length > PARENT_PIN_MAX_LENGTH) {
    return { ok: false, error: `家长密码最多支持 ${PARENT_PIN_MAX_LENGTH} 位字符` };
  }
  return { ok: true, normalized };
}

export function hashParentPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyParentPin(pin: string, stored: string): boolean {
  const trimmedStored = stored.trim();
  if (!trimmedStored) return false;

  if (trimmedStored.startsWith("scrypt:")) {
    const parts = trimmedStored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    const derivedHex = crypto.scryptSync(pin, salt, 32).toString("hex");
    return safeEqualStrings(derivedHex, expectedHex);
  }

  // Legacy plaintext compatibility
  return safeEqualStrings(pin, trimmedStored);
}
