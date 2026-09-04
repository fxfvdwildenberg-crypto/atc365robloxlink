-- Linked Roblox accounts (server-only access via service role)
CREATE TABLE public.roblox_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL UNIQUE,
  roblox_user_id bigint NOT NULL UNIQUE,
  roblox_username text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.roblox_accounts TO service_role;
ALTER TABLE public.roblox_accounts ENABLE ROW LEVEL SECURITY;

-- Pending one-time verification codes
CREATE TABLE public.roblox_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  roblox_user_id bigint NOT NULL,
  roblox_username text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX roblox_verifications_discord_idx ON public.roblox_verifications (discord_user_id);
GRANT ALL ON public.roblox_verifications TO service_role;
ALTER TABLE public.roblox_verifications ENABLE ROW LEVEL SECURITY;

-- Snapshot of Discord role membership, refreshed on every Discord login
CREATE TABLE public.discord_members (
  discord_user_id text PRIMARY KEY,
  role_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.discord_members TO service_role;
ALTER TABLE public.discord_members ENABLE ROW LEVEL SECURITY;

-- Admin-managed configuration (never exposed to normal users)
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_config (key, value) VALUES ('required_role_id', '1491459844685824051');

-- Simple fixed-window rate limiting for the public Roblox API
CREATE TABLE public.api_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.api_rate_limits TO service_role;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(_bucket text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hits integer;
BEGIN
  INSERT INTO public.api_rate_limits (bucket, window_start, hits)
  VALUES (_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET hits = CASE
          WHEN public.api_rate_limits.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE public.api_rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN public.api_rate_limits.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE public.api_rate_limits.window_start
        END
  RETURNING hits INTO _hits;

  RETURN _hits <= _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER roblox_accounts_touch BEFORE UPDATE ON public.roblox_accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();