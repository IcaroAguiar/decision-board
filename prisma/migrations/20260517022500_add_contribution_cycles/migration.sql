CREATE TYPE "ContributionCycleStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SKIPPED', 'REPORTED', 'CLOSED');

CREATE UNIQUE INDEX "contribution_plans_id_user_id_portfolio_id_key" ON "contribution_plans"("id", "user_id", "portfolio_id");

CREATE TABLE "contribution_cycles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "contribution_plan_id" UUID NOT NULL,
    "cycle_month" DATE NOT NULL,
    "planned_amount" DECIMAL(20,8) NOT NULL,
    "confirmed_amount" DECIMAL(20,8),
    "status" "ContributionCycleStatus" NOT NULL DEFAULT 'PENDING',
    "strategy_id" VARCHAR(64) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contribution_cycles_contribution_plan_id_cycle_month_key" ON "contribution_cycles"("contribution_plan_id", "cycle_month");

CREATE INDEX "contribution_cycles_user_id_portfolio_id_cycle_month_idx" ON "contribution_cycles"("user_id", "portfolio_id", "cycle_month");

ALTER TABLE "contribution_cycles" ADD CONSTRAINT "contribution_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contribution_cycles" ADD CONSTRAINT "contribution_cycles_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contribution_cycles" ADD CONSTRAINT "contribution_cycles_contribution_plan_id_user_id_portfolio_id_fkey" FOREIGN KEY ("contribution_plan_id", "user_id", "portfolio_id") REFERENCES "contribution_plans"("id", "user_id", "portfolio_id") ON DELETE RESTRICT ON UPDATE CASCADE;
