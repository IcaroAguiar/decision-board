CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "provider" VARCHAR(64) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "raw_payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_snapshots_user_id_asset_id_captured_at_idx" ON "price_snapshots"("user_id", "asset_id", "captured_at");

CREATE INDEX "price_snapshots_asset_id_captured_at_idx" ON "price_snapshots"("asset_id", "captured_at");

ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
