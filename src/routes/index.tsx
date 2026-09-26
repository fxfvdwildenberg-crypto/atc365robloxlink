import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Radar,
  KeyRound,
} from "lucide-react";
import { getAccessState } from "@/lib/session.functions";

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

function Index() {
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

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="mono-caps text-[10px] text-muted-foreground">or use an access code</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form method="post" action="/api/public/code/login" className="flex flex-col gap-2">
              <label htmlFor="access-code" className="text-xs text-muted-foreground">
                Access code
              </label>
              <div className="flex gap-2">
                <input
                  id="access-code"
                  name="code"
                  type="password"
                  autoComplete="off"
                  placeholder="Enter access code"
                  className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
                >
                  <KeyRound className="size-4" /> Enter
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {data.access ? (
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
                : error === "bad_code"
                  ? "That access code is not valid."
                  : error === "code_rate_limited"
                    ? "Too many attempts. Please wait a few minutes and try again."
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
