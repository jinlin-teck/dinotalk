import type { LookupAddress } from "node:dns";
import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchProviderEndpoint } from "./provider-fetch";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns", async (original) => ({
  ...await original<typeof import("node:dns")>(),
  lookup,
}));

describe("provider HTTP requests", () => {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? "");
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/another-page" }).end();
      return;
    }
    response.end("relay OK");
  });
  let endpoint: string;

  beforeAll(async () => {
    lookup.mockImplementation((
      _hostname: string,
      _options: unknown,
      callback: (error: null, addresses: LookupAddress[]) => void
    ) => {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server needs a TCP port");
    endpoint = `http://speech-relay.test:${address.port}`;
  });

  afterEach(() => {
    paths.length = 0;
    vi.unstubAllEnvs();
    lookup.mockClear();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("uses the checked DNS address for a configured LAN relay", async () => {
    vi.stubEnv("ALLOWED_ENDPOINT_HOSTS", "speech-relay.test");
    vi.stubEnv("BLOCK_PRIVATE_ENDPOINTS", "0");

    const response = await fetchProviderEndpoint(endpoint, { signal: AbortSignal.timeout(2000) });
    expect(await response.text()).toBe("relay OK");
    expect(lookup).toHaveBeenCalled();
    expect(paths).toEqual(["/"]);
  });

  it("checks the resolved address even when the hostname is allowlisted", async () => {
    vi.stubEnv("ALLOWED_ENDPOINT_HOSTS", "speech-relay.test");
    vi.stubEnv("BLOCK_PRIVATE_ENDPOINTS", "1");

    await expect(
      fetchProviderEndpoint(endpoint, { signal: AbortSignal.timeout(2000) })
    ).rejects.toThrow();
    expect(lookup).toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  it("stops instead of following a redirect", async () => {
    vi.stubEnv("ALLOWED_ENDPOINT_HOSTS", "");
    vi.stubEnv("BLOCK_PRIVATE_ENDPOINTS", "0");

    await expect(
      fetchProviderEndpoint(`${endpoint}/redirect`, { signal: AbortSignal.timeout(2000) })
    ).rejects.toThrow();
    expect(paths).toEqual(["/redirect"]);
  });
});
