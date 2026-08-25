import { createFileRoute } from "@tanstack/react-router";
import { randomBytes } from "crypto";
import { STATE_COOKIE, cookie, discordConfig, redirectUri } from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/discord/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { clientId } = discordConfig();
        if (!clientId) {
          return new Response("Discord login is not configured yet.", { status: 503 });
        }
        const state = randomBytes(16).toString("hex");
        const url = new URL("https://discord.com/oauth2/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "identify guilds.members.read");
        url.searchParams.set("redirect_uri", redirectUri(request));
        url.searchParams.set("state", state);
        url.searchParams.set("prompt", "consent");

        const secure = new URL(request.url).protocol === "https:";
        return new Response(null, {
          status: 302,
          headers: {
            Location: url.toString(),
            "Set-Cookie": cookie(STATE_COOKIE, state, 600, secure),
          },
        });
      },
    },
  },
});
