import { createFileRoute } from "@tanstack/react-router";
import { SESSION_COOKIE, discordConfig, readCookie, verifySession } from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/go")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = verifySession(readCookie(request, SESSION_COOKIE));
        if (!session?.access) {
          return new Response(null, { status: 302, headers: { Location: "/?error=denied" } });
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: discordConfig().targetUrl,
            "Cache-Control": "no-store",
            Referrer-Policy: "no-referrer",
          },
        });
      },
    },
  },
});
