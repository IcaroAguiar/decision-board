CREATE TYPE "ContributionFrequency" AS ENUM ('MONTHLY');

CREATE TABLE "contribution_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "frequency" "ContributionFrequency" NOT NULL DEFAULT 'MONTHLY',
    "day_of_month" INTEGER NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_strategy_id" VARCHAR(64) NOT NULL,
    "cash_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contribution_plans_user_id_portfolio_id_is_active_idx" ON "contribution_plans"("user_id", "portfolio_id", "is_active");

CREATE INDEX "contribution_plans_cash_account_id_idx" ON "contribution_plans"("cash_account_id");

ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
