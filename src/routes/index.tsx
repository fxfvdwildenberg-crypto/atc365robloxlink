import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ExternalLink,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Radar,
  Gamepad2,
  Link2,
  Unlink,
  Copy,
  Settings,
  CheckCircle2,
} from "lucide-react";
import { getAccessState } from "@/lib/session.functions";
import {
  getRobloxState,
  startRobloxVerification,
  confirmRobloxVerification,
  unlinkRoblox,
  getAdminConfig,
  saveAdminConfig,
} from "@/lib/roblox.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ATC365 — Members-Only Access Portal" },
      {
        name: "description",
        content:
          "Sign in with Discord to verify your ATC365 server role, link your Roblox account and open the private members-only session.",
      },
      { property: "og:title", content: "ATC365 — Members-Only Access Portal" },
      {
        property: "og:description",
        content: "Role-verified Discord access to the private ATC365 session link and PTFS server.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Index,
});

type Mode = "direct" | "roblox";

function Index() {
  const [mode, setMode] = useState<Mode>("direct");

  const { data, isPending } = useQuery({
    queryKey: ["access-state"],
    queryFn: () => getAccessState(),
    refetchOnWindowFocus: true,
  });

  const error =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("error")
      : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-5 py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex size-16 items-center justify-center rounded-full border border-border bg-card">
          <Radar className="size-8 text-primary radar-sweep" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">ATC365</h1>
        <p className="mono-caps text-xs text-muted-foreground">Restricted access portal</p>
      </header>

      <section className="panel w-full max-w-md p-6">
        {isPending ? (
          <p className="text-center text-sm text-muted-foreground">Checking clearance…</p>
        ) : !data?.configured ? (
          <StatusBlock
            tone="warn"
            title="Portal not configured"
            body="Discord verification credentials haven't been added yet. The owner needs to finish setup."
          />
        ) : !data.signedIn ? (
          <div className="flex flex-col gap-5">
            <StatusBlock
              tone="warn"
              title="Verification required"
              body="Sign in with Discord so we can confirm you hold the required role in the ATC365 server. The destination link is never exposed to your browser."
            />
            <a
              href="/api/public/discord/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-discord font-semibold text-discord-foreground transition-opacity hover:opacity-90"
            >
              Continue with Discord
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
              <TabButton active={mode === "direct"} onClick={() => setMode("direct")}>
                <ExternalLink className="size-4" /> Direct link
              </TabButton>
              <TabButton active={mode === "roblox"} onClick={() => setMode("roblox")}>
                <Gamepad2 className="size-4" /> Roblox game
              </TabButton>
            </div>

            {mode === "direct" ? (
              data.access ? (
                <>
                  <StatusBlock
                    tone="ok"
                    title={`Clearance granted — ${data.username}`}
                    body="Your role was verified. Use the button below to open the session; the URL stays hidden server-side."
                  />
                  <a
                    href="/api/public/go"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-lg font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
                  >
                    <ExternalLink className="size-5" />
                    Open Link
                  </a>
                </>
              ) : (
                <StatusBlock
                  tone="deny"
                  title="Access denied"
                  body={`Signed in as ${data.username}, but you don't hold the required ATC365 role. Ask a staff member for access, then sign in again.`}
                />
              )
            ) : (
              <RobloxPanel />
            )}

            <SignOut />
          </div>
        )}

        {error ? (
          <p className="mt-4 text-center text-xs text-destructive">
            {error === "not_member"
              ? "You are not a member of the ATC365 Discord server."
              : error === "signin"
                ? "Please sign in with Discord first."
                : "Verification failed. Please try signing in again."}
          </p>
        ) : null}
      </section>

      <p className="max-w-md text-center text-xs text-muted-foreground">
        Destination links are stored server-side and only ever served as a redirect to verified
        members. They are never rendered in the page.
      </p>
    </main>
  );
}

function RobloxPanel() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["roblox-state"],
    queryFn: () => getRobloxState(),
  });
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["roblox-state"] });
  const fail = (e: unknown) => setMessage(e instanceof Error ? e.message : "Something went wrong.");

  const start = useMutation({
    mutationFn: (value: string) => startRobloxVerification({ data: { account: value } }),
    onSuccess: () => {
      setMessage(null);
      refresh();
    },
    onError: fail,
  });
  const confirm = useMutation({
    mutationFn: () => confirmRobloxVerification(),
    onSuccess: () => {
      setMessage(null);
      refresh();
    },
    onError: fail,
  });
  const unlink = useMutation({
    mutationFn: () => unlinkRoblox(),
    onSuccess: () => {
      setMessage(null);
      refresh();
    },
    onError: fail,
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading Roblox status…</p>;
  if (error || !data)
    return (
      <StatusBlock
        tone="deny"
        title="Service unavailable"
        body="We couldn't load your Roblox link right now. Please refresh and try again."
      />
    );

  const linked = data.linked;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="mono-caps text-xs text-muted-foreground">Roblox Account</h2>

        {linked?.verified ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <div>
                <p className="font-semibold">{linked.robloxUsername}</p>
                <p className="text-xs text-muted-foreground">User ID {linked.robloxUserId}</p>
              </div>
              <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                Verified
              </span>
            </div>
            <button
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Unlink className="size-3.5" /> Unlink Roblox Account
            </button>
          </div>
        ) : data.pending ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <p className="text-sm">
              Add this code to the <strong>About</strong> section of the Roblox profile for{" "}
              <strong>{data.pending.robloxUsername}</strong>, save it, then check again.
            </p>
            <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 font-mono text-sm">
              {data.pending.code}
              <button
                onClick={() => navigator.clipboard?.writeText(data.pending!.code)}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Copy verification code"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Single-use, expires {new Date(data.pending.expiresAt).toLocaleTimeString()}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              >
                {confirm.isPending ? "Checking…" : "I've added the code"}
              </button>
              <button
                onClick={() => unlink.mutate()}
                className="rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">
              Your Roblox account must be verified before it can be linked. We'll give you a
              one-time code to place in your Roblox profile so we know it's really yours.
            </p>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Roblox username or User ID"
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => start.mutate(account)}
              disabled={start.isPending || account.trim().length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Link2 className="size-4" />
              {start.isPending ? "Preparing…" : "Link Roblox Account"}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="mono-caps text-xs text-muted-foreground">PTFS Access</h2>
        {!linked?.verified ? (
          <StatusBlock
            tone="warn"
            title="Roblox account required"
            body="Link and verify your Roblox account first to unlock PTFS access."
          />
        ) : data.hasRole ? (
          <>
            <StatusBlock
              tone="ok"
              title="Access Granted"
              body="You hold the required ATC365 Discord role and your Roblox account is verified."
            />
            <a
              href="/api/public/roblox/join"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-lg font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              <Gamepad2 className="size-5" />
              Join ATC365 PTFS
            </a>
            {!data.ptfsConfigured ? (
              <p className="text-xs text-accent">
                An administrator still needs to configure the PTFS server link.
              </p>
            ) : null}
          </>
        ) : (
          <StatusBlock
            tone="deny"
            title="Access Denied"
            body="Your Discord account is missing the required ATC365 role. Ask a staff member to grant it, then sign in again."
          />
        )}
      </div>

      {message ? <p className="text-xs text-destructive">{message}</p> : null}

      {data.admin ? <AdminPanel /> : null}
    </div>
  );
}

function AdminPanel() {
  const { data } = useQuery({ queryKey: ["admin-config"], queryFn: () => getAdminConfig() });
  const [roleId, setRoleId] = useState<string | null>(null);
  const [ptfsUrl, setPtfsUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveAdminConfig({
        data: {
          requiredRoleId: roleId ?? data?.requiredRoleId ?? "",
          ptfsUrl: ptfsUrl ?? data?.ptfsUrl ?? "",
        },
      }),
    onSuccess: () => setNote("Saved."),
    onError: (e) => setNote(e instanceof Error ? e.message : "Could not save."),
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
      <h2 className="mono-caps flex items-center gap-2 text-xs text-muted-foreground">
        <Settings className="size-3.5" /> Administrator configuration
      </h2>
      <label className="text-xs text-muted-foreground">Required Discord role ID</label>
      <input
        value={roleId ?? data?.requiredRoleId ?? ""}
        onChange={(e) => setRoleId(e.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      <label className="text-xs text-muted-foreground">PTFS private server URL</label>
      <input
        value={ptfsUrl ?? data?.ptfsUrl ?? ""}
        onChange={(e) => setPtfsUrl(e.target.value)}
        placeholder="https://www.roblox.com/share?code=…"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="h-10 rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save configuration"}
      </button>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SignOut() {
  return (
    <a
      href="/api/public/discord/logout"
      className="inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <LogOut className="size-3.5" /> Sign out
    </a>
  );
}

function StatusBlock({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warn" | "deny";
  title: string;
  body: string;
}) {
  const Icon = tone === "ok" ? ShieldCheck : ShieldAlert;
  const color =
    tone === "ok" ? "text-primary" : tone === "deny" ? "text-destructive" : "text-accent";
  return (
    <div className="flex gap-3">
      <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} />
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
