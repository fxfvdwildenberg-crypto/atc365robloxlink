import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type RobloxState = {
  signedIn: boolean;
  admin: boolean;
  hasRole: boolean;
  ptfsConfigured: boolean;
  linked: null | { robloxUserId: number; robloxUsername: string; verified: boolean };
  pending: null | { robloxUserId: number; robloxUsername: string; code: string; expiresAt: string };
};

async function session() {
  const { SESSION_COOKIE, readCookie, verifySession } = await import("@/lib/discord.server");
  try {
    return verifySession(readCookie(getRequest(), SESSION_COOKIE));
  } catch {
    return null;
  }
}

function unauthorized(): never {
  throw new Error("Not signed in with Discord.");
}

export const getRobloxState = createServerFn({ method: "GET" }).handler(
  async (): Promise<RobloxState> => {
    const s = await session();
    if (!s) {
      return {
        signedIn: false,
        admin: false,
        hasRole: false,
        ptfsConfigured: false,
        linked: null,
        pending: null,
      };
    }
    const { getConfig, isAdmin, hasRequiredRole } = await import("@/lib/atc365.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await getConfig();
    const [{ data: link }, { data: pending }, role] = await Promise.all([
      supabaseAdmin
        .from("roblox_accounts")
        .select("roblox_user_id, roblox_username, verified")
        .eq("discord_user_id", s.id)
        .maybeSingle(),
      supabaseAdmin
        .from("roblox_verifications")
        .select("roblox_user_id, roblox_username, code, expires_at")
        .eq("discord_user_id", s.id)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      hasRequiredRole(s.id, cfg.requiredRoleId),
    ]);

    return {
      signedIn: true,
      admin: isAdmin(s.id),
      hasRole: role.hasRole || s.access,
      ptfsConfigured: Boolean(cfg.ptfsUrl),
      linked: link
        ? {
            robloxUserId: Number(link.roblox_user_id),
            robloxUsername: link.roblox_username,
            verified: link.verified,
          }
        : null,
      pending: pending
        ? {
            robloxUserId: Number(pending.roblox_user_id),
            robloxUsername: pending.roblox_username,
            code: pending.code,
            expiresAt: pending.expires_at,
          }
        : null,
    };
  },
);

export const startRobloxVerification = createServerFn({ method: "POST" })
  .inputValidator((input: { account: string }) => {
    const account = String(input?.account ?? "").trim();
    if (!account || account.length > 30) throw new Error("Enter a Roblox username or User ID.");
    return { account };
  })
  .handler(async ({ data }) => {
    const s = await session();
    if (!s) unauthorized();
    const { fetchRobloxUserById, fetchRobloxUserByUsername, rateLimit } = await import(
      "@/lib/atc365.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await rateLimit(`verify:${s.id}`, 10, 600))) {
      throw new Error("Too many attempts. Please wait a few minutes and try again.");
    }

    const numeric = /^\d{1,20}$/.test(data.account);
    const user = numeric
      ? await fetchRobloxUserById(Number(data.account))
      : await fetchRobloxUserByUsername(data.account);
    if (!user) throw new Error("That Roblox account could not be found.");

    const { data: taken } = await supabaseAdmin
      .from("roblox_accounts")
      .select("discord_user_id")
      .eq("roblox_user_id", user.id)
      .maybeSingle();
    if (taken && taken.discord_user_id !== s.id) {
      throw new Error("That Roblox account is already linked to another ATC365 member.");
    }

    const code = `ATC365-${Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("roblox_verifications")
      .update({ consumed_at: new Date().toISOString() })
      .eq("discord_user_id", s.id)
      .is("consumed_at", null);

    const { error } = await supabaseAdmin.from("roblox_verifications").insert({
      discord_user_id: s.id,
      roblox_user_id: user.id,
      roblox_username: user.name,
      code,
      expires_at: expiresAt,
    });
    if (error) throw new Error("Could not start verification. Please try again.");

    return { robloxUserId: user.id, robloxUsername: user.name, code, expiresAt };
  });

export const confirmRobloxVerification = createServerFn({ method: "POST" }).handler(async () => {
  const s = await session();
  if (!s) unauthorized();
  const { fetchRobloxUserById, rateLimit } = await import("@/lib/atc365.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!(await rateLimit(`confirm:${s.id}`, 15, 600))) {
    throw new Error("Too many verification checks. Please wait a few minutes.");
  }

  const { data: pending } = await supabaseAdmin
    .from("roblox_verifications")
    .select("id, roblox_user_id, roblox_username, code, expires_at")
    .eq("discord_user_id", s.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) throw new Error("No verification in progress. Start again.");
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    throw new Error("Your verification code expired. Start again to get a new one.");
  }

  const user = await fetchRobloxUserById(Number(pending.roblox_user_id));
  if (!user) throw new Error("Roblox is not responding right now. Try again shortly.");

  if (!(user.description ?? "").includes(pending.code)) {
    throw new Error(
      "Code not found in your Roblox profile description yet. Save it on Roblox, wait a moment, then check again.",
    );
  }

  const { error } = await supabaseAdmin.from("roblox_accounts").upsert(
    {
      discord_user_id: s.id,
      roblox_user_id: Number(pending.roblox_user_id),
      roblox_username: user.name,
      verified: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "discord_user_id" },
  );
  if (error) throw new Error("That Roblox account is already linked to another member.");

  await supabaseAdmin
    .from("roblox_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pending.id);

  return { robloxUserId: Number(pending.roblox_user_id), robloxUsername: user.name };
});

export const unlinkRoblox = createServerFn({ method: "POST" }).handler(async () => {
  const s = await session();
  if (!s) unauthorized();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("roblox_accounts").delete().eq("discord_user_id", s.id);
  await supabaseAdmin
    .from("roblox_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("discord_user_id", s.id)
    .is("consumed_at", null);
  return { ok: true };
});

/* ---------------------------------- admin ---------------------------------- */

export const getAdminConfig = createServerFn({ method: "GET" }).handler(async () => {
  const s = await session();
  if (!s) unauthorized();
  const { isAdmin, getConfig } = await import("@/lib/atc365.server");
  if (!isAdmin(s.id)) throw new Error("Forbidden");
  const cfg = await getConfig();
  return { requiredRoleId: cfg.requiredRoleId, ptfsUrl: cfg.ptfsUrl };
});

export const saveAdminConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { requiredRoleId: string; ptfsUrl: string }) => {
    const requiredRoleId = String(input?.requiredRoleId ?? "").trim();
    const ptfsUrl = String(input?.ptfsUrl ?? "").trim();
    if (!/^\d{5,25}$/.test(requiredRoleId)) throw new Error("Role ID must be numeric.");
    if (ptfsUrl && !/^https:\/\/(www\.)?roblox\.com\//.test(ptfsUrl)) {
      throw new Error("PTFS link must be a https://www.roblox.com/ URL.");
    }
    return { requiredRoleId, ptfsUrl };
  })
  .handler(async ({ data }) => {
    const s = await session();
    if (!s) unauthorized();
    const { isAdmin, setConfigValue } = await import("@/lib/atc365.server");
    if (!isAdmin(s.id)) throw new Error("Forbidden");
    await setConfigValue("required_role_id", data.requiredRoleId);
    await setConfigValue("ptfs_url", data.ptfsUrl);
    return { ok: true };
  });
