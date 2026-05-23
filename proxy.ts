// proxy.ts — Next.js 16+ (substitui middleware.ts do Next.js 14/15)
// Implementação completa de auth + role guards no LHG-199
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // TODO LHG-199: implementar Supabase session refresh + role guards
  return NextResponse.next();
}

export const proxyConfig = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
