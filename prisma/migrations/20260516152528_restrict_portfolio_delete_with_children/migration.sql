-- DropForeignKey
ALTER TABLE "cash_accounts" DROP CONSTRAINT "cash_accounts_portfolio_id_user_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_portfolio_id_user_id_fkey";

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_portfolio_id_user_id_fkey" FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
