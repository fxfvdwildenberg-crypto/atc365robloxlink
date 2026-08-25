import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type AccessState = {
  configured: boolean;
  signedIn: boolean;
  access: boolean;
  username: string | null;
  avatarUrl: string | null;
};

export const getAccessState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccessState> => {
    const { SESSION_COOKIE, readCookie, verifySession, discordConfig } = await import(
      "@/lib/discord.server"
    );
    const cfg = discordConfig();
    const configured = Boolean(
      cfg.clientId && cfg.clientSecret && cfg.guildId && cfg.roleId && process.env["SESSION_SECRET"],
    );
    const request = getRequest();
    let session = null;
    try {
      session = configured ? verifySession(readCookie(request, SESSION_COOKIE)) : null;
    } catch {
      session = null;
    }
    return {
      configured,
      signedIn: Boolean(session),
      access: Boolean(session?.access),
      username: session?.username ?? null,
      avatarUrl:
        session?.avatar && session.id
          ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=128`
          : null,
    };
  },
);
