CREATE TYPE "AssetType" AS ENUM ('FII', 'STOCK', 'ETF', 'CASH', 'OTHER');

CREATE TYPE "RiskCategory" AS ENUM ('BRICK', 'PAPER', 'HYBRID', 'CASH', 'OTHER');

CREATE TYPE "PositionSource" AS ENUM ('MANUAL', 'PROVIDER');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "segment" TEXT,
    "risk_category" "RiskCategory" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "exchange" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_asset_overrides" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "custom_name" TEXT,
    "custom_segment" TEXT,
    "custom_risk_category" "RiskCategory",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_asset_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "average_price" DECIMAL(20,8),
    "manual_current_price" DECIMAL(20,8),
    "source" "PositionSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" DECIMAL(20,8) NOT NULL,
    "liquidity" TEXT,
    "benchmark" TEXT,
    "benchmark_percent" DECIMAL(10,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "portfolios_id_user_id_key" ON "portfolios"("id", "user_id");
CREATE INDEX "portfolios_user_id_idx" ON "portfolios"("user_id");
CREATE UNIQUE INDEX "assets_ticker_exchange_key" ON "assets"("ticker", "exchange");
CREATE UNIQUE INDEX "user_asset_overrides_user_id_asset_id_key" ON "user_asset_overrides"("user_id", "asset_id");
CREATE INDEX "user_asset_overrides_asset_id_idx" ON "user_asset_overrides"("asset_id");
CREATE INDEX "positions_user_id_portfolio_id_idx" ON "positions"("user_id", "portfolio_id");
CREATE INDEX "positions_asset_id_idx" ON "positions"("asset_id");
CREATE INDEX "cash_accounts_user_id_portfolio_id_idx" ON "cash_accounts"("user_id", "portfolio_id");

ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_asset_overrides" ADD CONSTRAINT "user_asset_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_asset_overrides" ADD CONSTRAINT "user_asset_overrides_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
