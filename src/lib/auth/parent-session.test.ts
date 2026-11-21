import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMathChallenge,
  createParentSessionToken,
  hashParentPin,
  verifyMathChallenge,
  verifyParentPin,
  verifyParentSessionToken,
} from "./parent-session";

describe("parent-session challenge, scrypt PIN, and HMAC cookie tokens", () => {
  let tmpDir = "";
  const origDataDir = process.env.DATA_DIR;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinotalk-auth-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(() => {
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifies signed math challenge answers and rejects tampering or expiration", () => {
    const ch = createMathChallenge(60);
    expect(verifyMathChallenge(ch.token, ch.a + ch.b)).toBe(true);
    expect(verifyMathChallenge(ch.token, ch.a + ch.b + 1)).toBe(false);
    expect(verifyMathChallenge(`${ch.token}tamper`, ch.a + ch.b)).toBe(false);

    const expired = createMathChallenge(-5);
    expect(verifyMathChallenge(expired.token, expired.a + expired.b)).toBe(false);
  });

  it("keeps the answer out of the challenge token and rejects replay", () => {
    const ch = createMathChallenge(60);
    const payload = JSON.parse(
      Buffer.from(ch.token.split(".")[0], "base64url").toString("utf8")
    ) as Record<string, unknown>;

    expect(payload.sum).toBeUndefined();
    expect(payload.answer).toBeUndefined();
    expect(typeof payload.nonce).toBe("string");

    expect(verifyMathChallenge(ch.token, ch.a + ch.b)).toBe(true);
    expect(verifyMathChallenge(ch.token, ch.a + ch.b)).toBe(false);
  });

  it("hashes and verifies parent PINs using scrypt", () => {
    const hashed = hashParentPin("2580");
    expect(hashed.startsWith("scrypt:")).toBe(true);
    expect(verifyParentPin("2580", hashed)).toBe(true);
    expect(verifyParentPin("9999", hashed)).toBe(false);
  });

  it("issues and validates parent session tokens", () => {
    const token = createParentSessionToken(3, 60);
    expect(verifyParentSessionToken(token, 3)).toBe(true);
    expect(verifyParentSessionToken(token, 4)).toBe(false);
    expect(verifyParentSessionToken(`${token}x`, 3)).toBe(false);
    expect(verifyParentSessionToken(createParentSessionToken(3, -5), 3)).toBe(false);
  });
});
