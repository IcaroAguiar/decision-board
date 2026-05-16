-- Include currency in the canonical asset identity so one user's currency choice cannot affect another user's asset metadata.
DROP INDEX "assets_ticker_exchange_key";

CREATE UNIQUE INDEX "assets_ticker_exchange_currency_key" ON "assets"("ticker", "exchange", "currency");
