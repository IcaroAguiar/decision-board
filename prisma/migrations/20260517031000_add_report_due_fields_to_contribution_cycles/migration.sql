ALTER TABLE "contribution_cycles"
    ADD COLUMN "report_recommended_at" TIMESTAMP(3),
    ADD COLUMN "report_recommendation_reason" VARCHAR(120);

CREATE INDEX "contribution_cycles_user_id_portfolio_id_status_report_recommended_at_idx"
    ON "contribution_cycles"("user_id", "portfolio_id", "status", "report_recommended_at");
