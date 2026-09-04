import { createFileRoute } from "@tanstack/react-router";

const deny = (reason: string) =>
  new Response(JSON.stringify({ error: "forbidden", reason }), {
    status: 403,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/roblox/join")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { SESSION_COOKIE, readCookie, verifySession } = await import("@/lib/discord.server");
        const { getConfig, hasRequiredRole, rateLimit } = await import("@/lib/atc365.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let session = null;
        try {
          session = verifySession(readCookie(request, SESSION_COOKIE));
        } catch {
          session = null;
        }
        if (!session) {
          return new Response(null, { status: 302, headers: { Location: "/?error=signin" } });
        }

        if (!(await rateLimit(`join:${session.id}`, 30, 60))) {
          return deny("rate_limited");
        }

        const { data: link } = await supabaseAdmin
          .from("roblox_accounts")
          .select("verified")
          .eq("discord_user_id", session.id)
          .maybeSingle();
        if (!link) return deny("roblox_not_linked");
        if (!link.verified) return deny("roblox_not_verified");

        const cfg = await getConfig();
        const { hasRole } = await hasRequiredRole(session.id, cfg.requiredRoleId);
        if (!hasRole && !session.access) return deny("missing_discord_role");
        if (!cfg.ptfsUrl) return deny("ptfs_not_configured");

        return new Response(null, {
          status: 302,
          headers: {
            Location: cfg.ptfsUrl,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
