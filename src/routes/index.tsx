import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LogOut, ShieldCheck, ShieldAlert, Radar } from "lucide-react";
import { getAccessState } from "@/lib/session.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ATC365 — Members-Only Access Portal" },
      {
        name: "description",
        content:
          "Sign in with Discord to verify your ATC365 server role and open the private members-only session link.",
      },
      { property: "og:title", content: "ATC365 — Members-Only Access Portal" },
      {
        property: "og:description",
        content: "Role-verified Discord access to the private ATC365 session link.",
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
          </div>
        ) : data.access ? (
          <div className="flex flex-col gap-5">
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
            <SignOut />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <StatusBlock
              tone="deny"
              title="Access denied"
              body={`Signed in as ${data.username}, but you don't hold the required ATC365 role. Ask a staff member for access, then sign in again.`}
            />
            <SignOut />
          </div>
        )}

        {error ? (
          <p className="mt-4 text-center text-xs text-destructive">
            {error === "not_member"
              ? "You are not a member of the ATC365 Discord server."
              : "Verification failed. Please try signing in again."}
          </p>
        ) : null}
      </section>

      <p className="max-w-md text-center text-xs text-muted-foreground">
        The destination link is stored server-side and only ever served as a redirect to verified
        members. It is never rendered in the page.
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
