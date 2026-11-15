CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"email_verified" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "financial_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"investor_archetype" text DEFAULT 'The Patient Compounder',
	"risk_style" text DEFAULT 'Measured & Calculated',
	"decision_style" text DEFAULT 'Data-Informed',
	"monthly_income" numeric(14, 2),
	"monthly_expenses" numeric(14, 2),
	"emergency_fund_target_months" integer DEFAULT 6,
	"emergency_fund_actual" numeric(14, 2),
	"term_insurance_cover" numeric(14, 2),
	"health_insurance_cover" numeric(14, 2),
	"risk_tolerance_score" integer DEFAULT 70,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_type" text NOT NULL,
	"institution_name" text NOT NULL,
	"account_identifier_masked" text,
	"connection_status" text DEFAULT 'manual' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isin" varchar(12),
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"sector" text,
	"exchange" text DEFAULT 'NSE',
	"amfi_code" text,
	"market_cap_category" text,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"units" numeric(18, 4) NOT NULL,
	"average_acquisition_cost" numeric(14, 2),
	"first_purchased_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"quantity" numeric(18, 4),
	"unit_price" numeric(14, 2),
	"gross_amount" numeric(14, 2) NOT NULL,
	"brokerage_fee" numeric(14, 2) DEFAULT '0',
	"stt" numeric(14, 2) DEFAULT '0',
	"stamp_duty" numeric(14, 2) DEFAULT '0',
	"gst" numeric(14, 2) DEFAULT '0',
	"other_charges" numeric(14, 2) DEFAULT '0',
	"net_amount" numeric(14, 2) NOT NULL,
	"external_order_id" text,
	"external_trade_id" text,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"day_change" numeric(14, 2),
	"day_change_pct" numeric(6, 2),
	"previous_close" numeric(14, 2),
	"high" numeric(14, 2),
	"low" numeric(14, 2),
	"price_timestamp" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"is_realtime" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'shield' NOT NULL,
	"target_amount" numeric(14, 2) NOT NULL,
	"current_allocated_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monthly_contribution" numeric(14, 2) DEFAULT '0' NOT NULL,
	"target_year" integer NOT NULL,
	"target_date" timestamp with time zone,
	"priority" integer DEFAULT 1 NOT NULL,
	"category" text DEFAULT 'OTHER',
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New Consultation' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD CONSTRAINT "financial_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_isin_idx" ON "instruments" USING btree ("isin");--> statement-breakpoint
CREATE INDEX "instruments_symbol_exchange_idx" ON "instruments" USING btree ("symbol","exchange");--> statement-breakpoint
CREATE INDEX "instruments_asset_class_idx" ON "instruments" USING btree ("asset_class");--> statement-breakpoint
CREATE INDEX "instruments_amfi_code_idx" ON "instruments" USING btree ("amfi_code");--> statement-breakpoint
CREATE INDEX "holdings_user_id_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holdings_account_id_idx" ON "holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "holdings_instrument_id_idx" ON "holdings" USING btree ("instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_user_account_instrument_idx" ON "holdings" USING btree ("user_id","account_id","instrument_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_account_id_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_instrument_id_idx" ON "transactions" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_external_order_idx" ON "transactions" USING btree ("external_order_id");--> statement-breakpoint
CREATE INDEX "market_prices_instrument_id_idx" ON "market_prices" USING btree ("instrument_id");--> statement-breakpoint
CREATE INDEX "market_prices_instrument_timestamp_idx" ON "market_prices" USING btree ("instrument_id","price_timestamp");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_priority_idx" ON "goals" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages" USING btree ("created_at");