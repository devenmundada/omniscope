-- OmniScope Phase 3: Supabase Auth Identity Mapping & Row-Level Security Policies
-- Additive migration: links auth.users to public.users and establishes strict RLS on all 10 tables

-- 1. Identity Mapping & Foreign Key Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_id_auth_users_id_fk' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_id_auth_users_id_fk
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

-- 2. Automatic user profile provisioning trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, image, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.users.name),
    updated_at = now();

  INSERT INTO public.financial_profiles (user_id, display_name, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- 3. Enable RLS across all 10 tables (idempotent)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.financial_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 4. RLS Policies: users
DROP POLICY IF EXISTS "users_select_own" ON public.users;
--> statement-breakpoint
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
--> statement-breakpoint

DROP POLICY IF EXISTS "users_update_own" ON public.users;
--> statement-breakpoint
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
--> statement-breakpoint

-- 5. RLS Policies: financial_profiles
DROP POLICY IF EXISTS "financial_profiles_select_own" ON public.financial_profiles;
--> statement-breakpoint
CREATE POLICY "financial_profiles_select_own" ON public.financial_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "financial_profiles_insert_own" ON public.financial_profiles;
--> statement-breakpoint
CREATE POLICY "financial_profiles_insert_own" ON public.financial_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "financial_profiles_update_own" ON public.financial_profiles;
--> statement-breakpoint
CREATE POLICY "financial_profiles_update_own" ON public.financial_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "financial_profiles_delete_own" ON public.financial_profiles;
--> statement-breakpoint
CREATE POLICY "financial_profiles_delete_own" ON public.financial_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 6. RLS Policies: accounts
DROP POLICY IF EXISTS "accounts_select_own" ON public.accounts;
--> statement-breakpoint
CREATE POLICY "accounts_select_own" ON public.accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "accounts_insert_own" ON public.accounts;
--> statement-breakpoint
CREATE POLICY "accounts_insert_own" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "accounts_update_own" ON public.accounts;
--> statement-breakpoint
CREATE POLICY "accounts_update_own" ON public.accounts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "accounts_delete_own" ON public.accounts;
--> statement-breakpoint
CREATE POLICY "accounts_delete_own" ON public.accounts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 7. RLS Policies: holdings
DROP POLICY IF EXISTS "holdings_select_own" ON public.holdings;
--> statement-breakpoint
CREATE POLICY "holdings_select_own" ON public.holdings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "holdings_insert_own" ON public.holdings;
--> statement-breakpoint
CREATE POLICY "holdings_insert_own" ON public.holdings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "holdings_update_own" ON public.holdings;
--> statement-breakpoint
CREATE POLICY "holdings_update_own" ON public.holdings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "holdings_delete_own" ON public.holdings;
--> statement-breakpoint
CREATE POLICY "holdings_delete_own" ON public.holdings
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 8. RLS Policies: transactions
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
--> statement-breakpoint
CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
--> statement-breakpoint
CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
--> statement-breakpoint
CREATE POLICY "transactions_update_own" ON public.transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;
--> statement-breakpoint
CREATE POLICY "transactions_delete_own" ON public.transactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 9. RLS Policies: goals
DROP POLICY IF EXISTS "goals_select_own" ON public.goals;
--> statement-breakpoint
CREATE POLICY "goals_select_own" ON public.goals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "goals_insert_own" ON public.goals;
--> statement-breakpoint
CREATE POLICY "goals_insert_own" ON public.goals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "goals_update_own" ON public.goals;
--> statement-breakpoint
CREATE POLICY "goals_update_own" ON public.goals
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "goals_delete_own" ON public.goals;
--> statement-breakpoint
CREATE POLICY "goals_delete_own" ON public.goals
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 10. RLS Policies: ai_conversations
DROP POLICY IF EXISTS "ai_conversations_select_own" ON public.ai_conversations;
--> statement-breakpoint
CREATE POLICY "ai_conversations_select_own" ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_conversations_insert_own" ON public.ai_conversations;
--> statement-breakpoint
CREATE POLICY "ai_conversations_insert_own" ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_conversations_update_own" ON public.ai_conversations;
--> statement-breakpoint
CREATE POLICY "ai_conversations_update_own" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_conversations_delete_own" ON public.ai_conversations;
--> statement-breakpoint
CREATE POLICY "ai_conversations_delete_own" ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
--> statement-breakpoint

-- 11. RLS Policies: ai_messages (Restricted through parent ai_conversations owner)
DROP POLICY IF EXISTS "ai_messages_select_own" ON public.ai_messages;
--> statement-breakpoint
CREATE POLICY "ai_messages_select_own" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE public.ai_conversations.id = public.ai_messages.conversation_id
        AND public.ai_conversations.user_id = auth.uid()
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_messages_insert_own" ON public.ai_messages;
--> statement-breakpoint
CREATE POLICY "ai_messages_insert_own" ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE public.ai_conversations.id = public.ai_messages.conversation_id
        AND public.ai_conversations.user_id = auth.uid()
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_messages_update_own" ON public.ai_messages;
--> statement-breakpoint
CREATE POLICY "ai_messages_update_own" ON public.ai_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE public.ai_conversations.id = public.ai_messages.conversation_id
        AND public.ai_conversations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE public.ai_conversations.id = public.ai_messages.conversation_id
        AND public.ai_conversations.user_id = auth.uid()
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "ai_messages_delete_own" ON public.ai_messages;
--> statement-breakpoint
CREATE POLICY "ai_messages_delete_own" ON public.ai_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE public.ai_conversations.id = public.ai_messages.conversation_id
        AND public.ai_conversations.user_id = auth.uid()
    )
  );
--> statement-breakpoint

-- 12. RLS Policies: instruments & market_prices (Public Read-Only)
DROP POLICY IF EXISTS "instruments_read_all" ON public.instruments;
--> statement-breakpoint
CREATE POLICY "instruments_read_all" ON public.instruments
  FOR SELECT TO authenticated, anon
  USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS "market_prices_read_all" ON public.market_prices;
--> statement-breakpoint
CREATE POLICY "market_prices_read_all" ON public.market_prices
  FOR SELECT TO authenticated, anon
  USING (true);
--> statement-breakpoint

-- 13. Role Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public.instruments, public.market_prices TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.financial_profiles, public.accounts, public.holdings, public.transactions, public.goals, public.ai_conversations, public.ai_messages TO authenticated;
