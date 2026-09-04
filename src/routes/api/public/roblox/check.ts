import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/roblox/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getConfig, hasRequiredRole, rateLimit } = await import("@/lib/atc365.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Optional shared key: when ROBLOX_API_KEY is set, callers must send it.
        const expectedKey = process.env["ROBLOX_API_KEY"];
        if (expectedKey) {
          const provided =
            request.headers.get("x-api-key") ??
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            "";
          if (provided !== expectedKey) {
            return json({ authorized: false, reason: "unauthorized_request" }, 401);
          }
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        if (!(await rateLimit(`check:${ip}`, 120, 60))) {
          return json({ authorized: false, reason: "rate_limited" }, 429);
        }

        const raw = new URL(request.url).searchParams.get("userId") ?? "";
        if (!/^\d{1,20}$/.test(raw) || Number(raw) <= 0) {
          return json({ authorized: false, reason: "invalid_user_id" }, 400);
        }

        const { data: link } = await supabaseAdmin
          .from("roblox_accounts")
          .select("discord_user_id, verified")
          .eq("roblox_user_id", Number(raw))
          .maybeSingle();

        if (!link) return json({ authorized: false, reason: "not_linked" });
        if (!link.verified) return json({ authorized: false, reason: "not_verified" });

        const cfg = await getConfig();
        const { hasRole } = await hasRequiredRole(link.discord_user_id, cfg.requiredRoleId);
        return json(hasRole ? { authorized: true } : { authorized: false, reason: "missing_role" });
      },
    },
  },
});
