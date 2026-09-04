import { createFileRoute } from "@tanstack/react-router";
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  cookie,
  discordConfig,
  exchangeCode,
  fetchMember,
  readCookie,
  signSession,
} from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secure = url.protocol === "https:";
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const expected = readCookie(request, STATE_COOKIE);

        const fail = (reason: string) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `/?error=${encodeURIComponent(reason)}`,
              "Set-Cookie": cookie(STATE_COOKIE, "", 0, secure),
            },
          });

        if (!code || !state || !expected || state !== expected) return fail("state");

        const token = await exchangeCode(code, request);
        if (!token?.access_token) return fail("token");

        const member = await fetchMember(token.access_token);
        if (!member) return fail("not_member");

        const { roleId } = discordConfig();
        const access = Boolean(roleId) && member.roles?.includes(roleId);

        // Keep a role snapshot so the Roblox API can authorize the member later.
        if (member.user?.id) {
          try {
            const { upsertRoleSnapshot } = await import("@/lib/atc365.server");
            await upsertRoleSnapshot(member.user.id, member.roles ?? []);
          } catch {
            /* non-fatal */
          }
        }


        const session = signSession({
          id: member.user?.id ?? "unknown",
          username:
            member.nick ?? member.user?.global_name ?? member.user?.username ?? "Member",
          avatar: member.user?.avatar ?? null,
          access,
          exp: Date.now() + 1000 * 60 * 60 * 6,
        });

        const headers = new Headers();
        headers.append("Location", "/");
        headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0, secure));
        headers.append("Set-Cookie", cookie(SESSION_COOKIE, session, 60 * 60 * 6, secure));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
