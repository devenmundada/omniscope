-- OmniScope Phase 9: daily price history (for XIRR, growth charts, Monte Carlo calibration)
-- and a per-user cache for AI-generated insights (news impact, daily story).
-- Every statement is idempotent so this file can run on every deploy.

CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  price_date date NOT NULL,
  close numeric(18,4) NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_history_instrument_date_unique ON public.price_history (instrument_id, price_date);
CREATE INDEX IF NOT EXISTS price_history_date_idx ON public.price_history (price_date);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_history' AND policyname = 'price_history_read_authenticated') THEN
    CREATE POLICY price_history_read_authenticated ON public.price_history FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_insight_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  cache_key text NOT NULL,
  content jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_insight_cache_user_kind_key_unique ON public.ai_insight_cache (user_id, kind, cache_key);
ALTER TABLE public.ai_insight_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_insight_cache' AND policyname = 'ai_insight_cache_owner_all') THEN
    CREATE POLICY ai_insight_cache_owner_all ON public.ai_insight_cache FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
