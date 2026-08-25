import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "atc365_session";
export const STATE_COOKIE = "atc365_oauth_state";

export type SessionPayload = {
  id: string;
  username: string;
  avatar: string | null;
  access: boolean;
  exp: number;
};

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function secret() {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET missing");
  return s;
}

export function signSession(payload: SessionPayload) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(raw: string | undefined | null): SessionPayload | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    secure ? "; Secure" : ""
  }`;
}

export function discordConfig() {
  return {
    clientId: process.env["DISCORD_CLIENT_ID"] ?? "",
    clientSecret: process.env["DISCORD_CLIENT_SECRET"] ?? "",
    guildId: process.env["DISCORD_GUILD_ID"] ?? "",
    roleId: process.env["DISCORD_ROLE_ID"] ?? "",
    targetUrl:
      process.env["TARGET_LINK_URL"] ??
      "https://www.roblox.com/share?code=0d660588489a584cbb1f0dbb9b2c5f34&type=Server",
  };
}

export function redirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/api/public/discord/callback`;
}

export async function exchangeCode(code: string, request: Request) {
  const { clientId, clientSecret } = discordConfig();
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(request),
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { access_token: string };
}

export async function fetchMember(accessToken: string) {
  const { guildId } = discordConfig();
  const res = await fetch(
    `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    roles: string[];
    user?: { id: string; username: string; global_name?: string | null; avatar: string | null };
    nick?: string | null;
  };
}
