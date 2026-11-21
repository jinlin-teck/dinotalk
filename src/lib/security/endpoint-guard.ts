import { NextResponse } from "next/server";

export type EndpointValidationResult =
  | { ok: true; normalized: string; origin: string }
  | { ok: false; error: string };

const METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
]);

function normalizeHostname(hostname: string): string {
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return bare.toLowerCase().replace(/\.$/, "");
}

function parseIpv4Octets(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return nums;
}

function isAlwaysBlockedHost(rawHostname: string): boolean {
  const host = normalizeHostname(rawHostname);
  if (!host) return true;
  if (METADATA_HOSTNAMES.has(host)) return true;
  if (host === "fd00:ec2::254") return true;

  // Unspecified addresses
  if (host === "0.0.0.0" || host === "::" || host === "::0" || host === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // IPv4 link-local (AWS/GCP/Azure metadata 169.254.169.254) & Alibaba Cloud metadata
  const v4 = parseIpv4Octets(host);
  if (v4) {
    if (v4[0] === 0) return true;
    if (v4[0] === 169 && v4[1] === 254) return true;
    if (v4[0] === 100 && v4[1] === 100 && v4[2] === 100 && v4[3] === 200) return true;
    return false;
  }

  // IPv6 link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

  // IPv4-mapped IPv6 variants (dotted or hex form)
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice("::ffff:".length);
    const mappedV4 = parseIpv4Octets(mapped);
    if (mappedV4) {
      return isAlwaysBlockedHost(mapped);
    }
    const hexGroups = mapped.split(":");
    if (hexGroups.length === 2 && hexGroups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) {
      const hi = parseInt(hexGroups[0], 16);
      const lo = parseInt(hexGroups[1], 16);
      const octets = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
      return isAlwaysBlockedHost(octets.join("."));
    }
  }

  return false;
}

function isPrivateOrLoopbackHost(rawHostname: string): boolean {
  const host = normalizeHostname(rawHostname);
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0:0:0:0:0:0:0:1") {
    return true;
  }
  const v4 = parseIpv4Octets(host);
  if (v4) {
    if (v4[0] === 127) return true;
    if (v4[0] === 10) return true;
    if (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) return true;
    if (v4[0] === 192 && v4[1] === 168) return true;
    if (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) return true;
    return false;
  }
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice("::ffff:".length);
    const mappedV4 = parseIpv4Octets(mapped);
    if (mappedV4) return isPrivateOrLoopbackHost(mapped);
    const hexGroups = mapped.split(":");
    if (hexGroups.length === 2 && hexGroups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) {
      const hi = parseInt(hexGroups[0], 16);
      const lo = parseInt(hexGroups[1], 16);
      return isPrivateOrLoopbackHost(
        `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
      );
    }
  }
  // IPv6 ULA fc00::/7 (fc.. or fd..)
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  return false;
}

export function isBlockedEndpointAddress(address: string, blockPrivate: boolean): boolean {
  return isAlwaysBlockedHost(address) || (blockPrivate && isPrivateOrLoopbackHost(address));
}

function matchesAllowlist(url: URL, allowlistRaw: string): boolean {
  const entries = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const hostname = normalizeHostname(url.hostname);
  const hostWithPort = url.port
    ? `${hostname.includes(":") ? `[${hostname}]` : hostname}:${url.port}`
    : hostname;

  return entries.some((pattern) => {
    if (pattern.startsWith(".")) {
      return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    }
    return hostname === pattern || hostWithPort === pattern;
  });
}

export function validateEndpointUrl(
  rawUrl: string,
  options: { allowEmpty?: boolean } = {}
): EndpointValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return { ok: true, normalized: "", origin: "" };
    }
    return { ok: false, error: "接口地址不能为空，请填写 http:// 或 https:// 地址" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "接口地址格式不正确，请输入完整的 http:// 或 https:// 地址",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "接口地址仅支持 http:// 或 https:// 协议",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: "接口地址中禁止直接包含用户名或密码凭据",
    };
  }

  if (isAlwaysBlockedHost(parsed.hostname)) {
    return {
      ok: false,
      error: "出于安全限制，不允许访问本机元数据或保留网段地址",
    };
  }

  const allowlistRaw = process.env.ALLOWED_ENDPOINT_HOSTS?.trim() || "";
  if (allowlistRaw && !matchesAllowlist(parsed, allowlistRaw)) {
    return {
      ok: false,
      error: "该接口域名不在 ALLOWED_ENDPOINT_HOSTS 白名单中",
    };
  }
  if (
    process.env.BLOCK_PRIVATE_ENDPOINTS === "1" &&
    isPrivateOrLoopbackHost(parsed.hostname)
  ) {
    return {
      ok: false,
      error: "当前已启用 BLOCK_PRIVATE_ENDPOINTS，禁止访问内网或回环地址",
    };
  }

  return {
    ok: true,
    normalized: trimmed.replace(/\/+$/, ""),
    origin: parsed.origin,
  };
}

export function getUrlOrigin(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function canReuseStoredSecret(
  candidateBaseUrl: string,
  storedBaseUrl: string,
  defaultBaseUrl = ""
): boolean {
  const candidateOrigin = getUrlOrigin(candidateBaseUrl.trim() || defaultBaseUrl);
  const storedOrigin = getUrlOrigin(storedBaseUrl.trim() || defaultBaseUrl);
  return Boolean(candidateOrigin && storedOrigin && candidateOrigin === storedOrigin);
}

function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const separator = host.lastIndexOf(":");
  return separator === -1 ? host : host.slice(0, separator);
}

function matchesHostAllowlist(host: string, allowlistRaw: string): boolean {
  const bareHost = stripPort(host);
  const entries = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return entries.some((pattern) =>
    pattern.startsWith(".")
      ? bareHost === pattern.slice(1) || bareHost.endsWith(pattern)
      : host === pattern || bareHost === pattern
  );
}

export function getRequestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  const host = request.headers.get("host")?.trim();
  if (host) return host.toLowerCase();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * 可选的 Host 白名单（ALLOWED_HOSTS），用于缓解 DNS rebinding：
 * 仅校验 Origin 与 Host 是否一致无法阻止攻击者把域名解析到内网 IP。
 */
export function assertAllowedHost(request: Request): NextResponse | null {
  const allowlistRaw = process.env.ALLOWED_HOSTS?.trim() || "";
  if (!allowlistRaw) return null;

  const host = getRequestHost(request);
  if (!host) {
    return NextResponse.json({ error: "缺少 Host 请求头" }, { status: 400 });
  }
  if (!matchesHostAllowlist(host, allowlistRaw)) {
    return NextResponse.json(
      { error: "当前访问域名不在 ALLOWED_HOSTS 白名单中" },
      { status: 403 }
    );
  }
  return null;
}

export function assertSameOrigin(request: Request): NextResponse | null {
  const hostError = assertAllowedHost(request);
  if (hostError) return hostError;

  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return null;
  }

  let originHost: string;
  try {
    originHost = new URL(originHeader).host.toLowerCase();
  } catch {
    return NextResponse.json({ error: "非法的请求来源 Origin" }, { status: 403 });
  }

  const allowedHosts = new Set<string>();
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const first = forwardedHost.split(",")[0]?.trim().toLowerCase();
    if (first) allowedHosts.add(first);
  }
  const hostHeader = request.headers.get("host")?.trim().toLowerCase();
  if (hostHeader) {
    allowedHosts.add(hostHeader);
  }

  if (allowedHosts.size === 0) {
    try {
      allowedHosts.add(new URL(request.url).host.toLowerCase());
    } catch {
      // ignore invalid request.url
    }
  }

  if (!allowedHosts.has(originHost)) {
    return NextResponse.json({ error: "禁止跨站发起该操作" }, { status: 403 });
  }

  return null;
}

export function assertJsonSameOrigin(request: Request): NextResponse | null {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "请求 Content-Type 必须为 application/json" },
      { status: 415 }
    );
  }
  return assertSameOrigin(request);
}
