/**
 * Server-only helpers for ATC365 Roblox linking + PTFS authorization.
 * Never import this from a component; only from server fn handlers / server routes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEFAULT_REQUIRED_ROLE_ID = "1491459844685824051";

/* ---------------------------------- config --------------------------------- */

export type AdminConfig = { requiredRoleId: string; ptfsUrl: string };

export async function getConfig(): Promise<AdminConfig> {
  const { data } = await supabaseAdmin.from("app_config").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    requiredRoleId:
      map.get("required_role_id") ||
      process.env["DISCORD_ROLE_ID"] ||
      DEFAULT_REQUIRED_ROLE_ID,
    ptfsUrl: map.get("ptfs_url") || process.env["PTFS_PRIVATE_SERVER_URL"] || "",
  };
}

export async function setConfigValue(key: "required_role_id" | "ptfs_url", value: string) {
  const { error } = await supabaseAdmin
    .from("app_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export function adminIds(): string[] {
  return (process.env["ATC365_ADMIN_DISCORD_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(discordUserId: string) {
  return adminIds().includes(discordUserId);
}

/* --------------------------------- discord --------------------------------- */

export async function upsertRoleSnapshot(discordUserId: string, roleIds: string[]) {
  await supabaseAdmin.from("discord_members").upsert(
    { discord_user_id: discordUserId, role_ids: roleIds, updated_at: new Date().toISOString() },
    { onConflict: "discord_user_id" },
  );
}

/**
 * Authoritative role check.
 * Uses the Discord bot token when configured (live check, works without the user present).
 * Falls back to the snapshot captured at the user's last Discord login.
 */
export async function hasRequiredRole(
  discordUserId: string,
  requiredRoleId: string,
): Promise<{ hasRole: boolean; source: "bot" | "snapshot" | "none" }> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const guildId = process.env["DISCORD_GUILD_ID"];
  if (token && guildId) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`,
        { headers: { Authorization: `Bot ${token}` } },
      );
      if (res.status === 404) return { hasRole: false, source: "bot" };
      if (res.ok) {
        const member = (await res.json()) as { roles?: string[] };
        const hasRole = Boolean(member.roles?.includes(requiredRoleId));
        await upsertRoleSnapshot(discordUserId, member.roles ?? []);
        return { hasRole, source: "bot" };
      }
    } catch {
      /* fall through to snapshot */
    }
  }

  const { data } = await supabaseAdmin
    .from("discord_members")
    .select("role_ids")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  if (!data) return { hasRole: false, source: "none" };
  return { hasRole: (data.role_ids ?? []).includes(requiredRoleId), source: "snapshot" };
}

/* ---------------------------------- roblox --------------------------------- */

export type RobloxUser = { id: number; name: string; displayName: string; description?: string };

export async function fetchRobloxUserById(id: number): Promise<RobloxUser | null> {
  const res = await fetch(`https://users.roblox.com/v1/users/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as RobloxUser;
}

export async function fetchRobloxUserByUsername(username: string): Promise<RobloxUser | null> {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ id: number; name: string }> };
  const hit = json.data?.[0];
  if (!hit) return null;
  return fetchRobloxUserById(hit.id);
}

/* ------------------------------- rate limiting ------------------------------ */

export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
    _bucket: bucket,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) return true; // fail open on limiter outage, never on authorization
  return data !== false;
}
