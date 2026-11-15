-- OmniScope Phase 5: Market Data Foundation, NAV Precision & Unique Instrument Pricing
-- Additive migration: Upgrades market_prices precision to numeric(18, 4), adds price_type, and establishes instrument uniqueness for idempotent upserts.

ALTER TABLE "market_prices" ALTER COLUMN "price" TYPE numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "previous_close" TYPE numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "day_change" TYPE numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "high" TYPE numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "market_prices" ALTER COLUMN "low" TYPE numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "market_prices" ADD COLUMN IF NOT EXISTS "price_type" text DEFAULT 'LTP' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_prices_instrument_unique" ON "market_prices" USING btree ("instrument_id");
