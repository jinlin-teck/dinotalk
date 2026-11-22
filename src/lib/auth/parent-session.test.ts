import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createParentSessionToken,
  hashParentPin,
  validateParentPinFormat,
  verifyParentPin,
  verifyParentSessionToken,
} from "./parent-session";
import {
  buildActiveProfileCookie,
  extractProfileIdFromRequest,
} from "./profile-session";

describe("parent-session scrypt PIN, format validation, HMAC cookies, and profile-session cookies", () => {
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

  it("validates parent PIN format rules", () => {
    expect(validateParentPinFormat("")).toMatchObject({ ok: false });
    expect(validateParentPinFormat("  123 ")).toMatchObject({ ok: false });
    expect(validateParentPinFormat("a".repeat(33))).toMatchObject({ ok: false });
    expect(validateParentPinFormat("  2580 ")).toEqual({ ok: true, normalized: "2580" });
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

  it("extracts and builds active child profile cookies safely", () => {
    const reqValid = new Request("http://localhost:3000/api/profile", {
      headers: { Cookie: "foo=bar; dinotalk_profile_id=12; baz=1" },
    });
    expect(extractProfileIdFromRequest(reqValid)).toBe(12);

    const reqInvalid = new Request("http://localhost:3000/api/profile", {
      headers: { Cookie: "dinotalk_profile_id=-3" },
    });
    expect(extractProfileIdFromRequest(reqInvalid)).toBeNull();

    const setCookie = buildActiveProfileCookie(7, new Request("https://example.com/"));
    expect(setCookie).toContain("dinotalk_profile_id=7");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");

    const clearCookie = buildActiveProfileCookie(null, new Request("http://localhost:3000/"));
    expect(clearCookie).toContain("dinotalk_profile_id=");
    expect(clearCookie).toContain("Max-Age=0");
  });
});
