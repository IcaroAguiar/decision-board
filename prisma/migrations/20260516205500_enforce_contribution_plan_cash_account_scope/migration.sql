ALTER TABLE "contribution_plans" DROP CONSTRAINT "contribution_plans_cash_account_id_fkey";

CREATE UNIQUE INDEX "cash_accounts_id_user_id_portfolio_id_key" ON "cash_accounts"("id", "user_id", "portfolio_id");

ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_cash_account_id_user_id_portfolio_id_fkey" FOREIGN KEY ("cash_account_id", "user_id", "portfolio_id") REFERENCES "cash_accounts"("id", "user_id", "portfolio_id") ON DELETE RESTRICT ON UPDATE CASCADE;
