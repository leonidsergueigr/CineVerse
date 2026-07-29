import { NextResponse } from "next/server";
import { getAllowedPlayerFrameOrigins } from "@/lib/streaming";

export function proxy() {
  const response = NextResponse.next();
  const contentSecurityPolicy = [
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    `frame-src ${getAllowedPlayerFrameOrigins().join(" ")}`,
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=()",
  );
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
