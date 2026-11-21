import { afterEach, describe, expect, it } from "vitest";
import {
  assertJsonSameOrigin,
  assertSameOrigin,
  canReuseStoredSecret,
  validateEndpointUrl,
} from "./endpoint-guard";

describe("endpoint-guard SSRF & secret origin binding", () => {
  const origAllowlist = process.env.ALLOWED_ENDPOINT_HOSTS;
  const origBlockPrivate = process.env.BLOCK_PRIVATE_ENDPOINTS;
  const origAllowedHosts = process.env.ALLOWED_HOSTS;

  afterEach(() => {
    if (origAllowlist === undefined) delete process.env.ALLOWED_ENDPOINT_HOSTS;
    else process.env.ALLOWED_ENDPOINT_HOSTS = origAllowlist;

    if (origBlockPrivate === undefined) delete process.env.BLOCK_PRIVATE_ENDPOINTS;
    else process.env.BLOCK_PRIVATE_ENDPOINTS = origBlockPrivate;

    if (origAllowedHosts === undefined) delete process.env.ALLOWED_HOSTS;
    else process.env.ALLOWED_HOSTS = origAllowedHosts;
  });

  it("allows public HTTPS, internal LAN relay HTTPS/HTTP, and localhost Ollama by default", () => {
    expect(validateEndpointUrl("https://api.deepseek.com/v1")).toEqual({
      ok: true,
      normalized: "https://api.deepseek.com/v1",
      origin: "https://api.deepseek.com",
    });
    expect(validateEndpointUrl("https://llm-gateway.home.arpa/v1/")).toEqual({
      ok: true,
      normalized: "https://llm-gateway.home.arpa/v1",
      origin: "https://llm-gateway.home.arpa",
    });
    expect(validateEndpointUrl("http://192.168.0.3:8080/v1")).toEqual({
      ok: true,
      normalized: "http://192.168.0.3:8080/v1",
      origin: "http://192.168.0.3:8080",
    });
    expect(validateEndpointUrl("http://127.0.0.1:11434/v1")).toEqual({
      ok: true,
      normalized: "http://127.0.0.1:11434/v1",
      origin: "http://127.0.0.1:11434",
    });
  });

  it("blocks dangerous protocols, embedded credentials, and cloud metadata / link-local addresses", () => {
    expect(validateEndpointUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateEndpointUrl("https://user:pass@api.example.com/v1").ok).toBe(false);
    expect(validateEndpointUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateEndpointUrl("http://100.100.100.200/latest/meta-data").ok).toBe(false);
    expect(validateEndpointUrl("http://metadata.google.internal/computeMetadata/v1").ok).toBe(false);
    expect(validateEndpointUrl("http://0.0.0.0:3000").ok).toBe(false);
    expect(validateEndpointUrl("http://[::ffff:169.254.169.254]/").ok).toBe(false);
    expect(validateEndpointUrl("http://[::ffff:a9fe:a9fe]/").ok).toBe(false);
    expect(validateEndpointUrl("http://[fe80::1]/").ok).toBe(false);
  });

  it("enforces ALLOWED_ENDPOINT_HOSTS and BLOCK_PRIVATE_ENDPOINTS when configured", () => {
    process.env.BLOCK_PRIVATE_ENDPOINTS = "1";
    expect(validateEndpointUrl("http://192.168.0.3:8080/v1").ok).toBe(false);
    expect(validateEndpointUrl("http://127.0.0.1:11434/v1").ok).toBe(false);
    expect(validateEndpointUrl("https://api.deepseek.com/v1").ok).toBe(true);

    process.env.ALLOWED_ENDPOINT_HOSTS = "api.deepseek.com,.internal.example";
    expect(validateEndpointUrl("https://relay.internal.example/v1").ok).toBe(true);
    expect(validateEndpointUrl("https://evil.example/v1").ok).toBe(false);
  });

  it("binds stored secrets strictly to matching origins", () => {
    expect(
      canReuseStoredSecret("https://api.deepseek.com/v1/chat", "https://api.deepseek.com/v1")
    ).toBe(true);
    expect(
      canReuseStoredSecret("https://evil.example/v1", "https://api.deepseek.com/v1")
    ).toBe(false);
    expect(
      canReuseStoredSecret("http://api.deepseek.com/v1", "https://api.deepseek.com/v1")
    ).toBe(false);
  });

  it("rejects non-JSON content-type and cross-origin requests in assertJsonSameOrigin", () => {
    const nonJsonReq = new Request("http://localhost:3000/api/settings/test", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "http://localhost:3000" },
      body: "{}",
    });
    expect(assertJsonSameOrigin(nonJsonReq)?.status).toBe(415);

    const crossOriginReq = new Request("http://localhost:3000/api/settings/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "https://attacker.example",
      },
      body: "{}",
    });
    expect(assertJsonSameOrigin(crossOriginReq)?.status).toBe(403);

    const sameOriginReq = new Request("http://localhost:3000/api/settings/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: "{}",
    });
    expect(assertJsonSameOrigin(sameOriginReq)).toBeNull();
  });

  it("enforces ALLOWED_HOSTS to mitigate DNS rebinding", () => {
    process.env.ALLOWED_HOSTS = "localhost:3000,.home.arpa";

    const allowed = new Request("http://localhost:3000/api/settings", {
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    });
    expect(assertSameOrigin(allowed)).toBeNull();

    const rebinding = new Request("http://attacker.example/api/settings", {
      headers: { host: "attacker.example", origin: "http://attacker.example" },
    });
    expect(assertSameOrigin(rebinding)?.status).toBe(403);

    const suffix = new Request("http://nas.home.arpa:3000/api/settings", {
      headers: { host: "nas.home.arpa:3000", origin: "http://nas.home.arpa:3000" },
    });
    expect(assertSameOrigin(suffix)).toBeNull();
  });
});
