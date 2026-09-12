import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { SESSION_COOKIE, cookie, signSession } from "@/lib/discord.server";

function matches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/code/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secure = url.protocol === "https:";

        const form = await request.formData();
        const provided = String(form.get("code") ?? "").trim();
        const expected = (process.env["ACCESS_CODE"] ?? "ATC365LINKENTERPLZ").trim();

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        try {
          const { rateLimit } = await import("@/lib/atc365.server");
          if (!(await rateLimit(`code:${ip}`, 10, 300))) {
            return new Response(null, {
              status: 302,
              headers: { Location: "/?error=code_rate_limited" },
            });
          }
        } catch {
          /* limiter outage: never block on it */
        }

        if (!provided || !matches(provided, expected)) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/?error=bad_code" },
          });
        }

        const session = signSession({
          id: `code-${crypto.randomUUID()}`,
          username: "Code access",
          avatar: null,
          access: true,
          exp: Date.now() + 1000 * 60 * 60 * 6,
        });

        const headers = new Headers();
        headers.append("Location", "/");
        headers.append("Cache-Control", "no-store");
        headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, 60 * 60 * 6, secure));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
