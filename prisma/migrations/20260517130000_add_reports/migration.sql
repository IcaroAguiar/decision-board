CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "schema_version" VARCHAR(16) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "strategy_id" VARCHAR(64),
    "alert_count" INTEGER NOT NULL DEFAULT 0,
    "json_report" JSONB NOT NULL,
    "markdown_report" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_user_id_portfolio_id_created_at_idx"
    ON "reports"("user_id", "portfolio_id", "created_at");

ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reports" ADD CONSTRAINT "reports_portfolio_id_user_id_fkey"
    FOREIGN KEY ("portfolio_id", "user_id") REFERENCES "portfolios"("id", "user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
