import { createFileRoute } from "@tanstack/react-router";
import { SESSION_COOKIE, cookie } from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/discord/logout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secure = new URL(request.url).protocol === "https:";
        return new Response(null, {
          status: 302,
          headers: { Location: "/", "Set-Cookie": cookie(SESSION_COOKIE, "", 0, secure) },
        });
      },
    },
  },
});
