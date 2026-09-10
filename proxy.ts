import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/env";

const privatePrefixes = ["/dashboard", "/profiles", "/searches", "/resumes"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPrivate = privatePrefixes.some((prefix) => pathname.startsWith(prefix));
  // Public discovery and authentication screens must never wait for an Auth
  // round trip. Their mutations verify the session server-side when needed.
  if (!isPrivate) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, anonKey } = getPublicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (isPrivate && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    if (pathname === "/resumes" && request.nextUrl.searchParams.get("action") === "prepare") {
      login.searchParams.set("return_to", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    } else {
      login.searchParams.set("next", request.nextUrl.pathname);
    }
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
