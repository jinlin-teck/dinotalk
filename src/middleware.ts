import { NextResponse, type NextRequest } from "next/server";
import { assertAllowedHost } from "@/lib/security/endpoint-guard";

export function middleware(request: NextRequest) {
  const hostError = assertAllowedHost(request);
  if (hostError) return hostError;
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
