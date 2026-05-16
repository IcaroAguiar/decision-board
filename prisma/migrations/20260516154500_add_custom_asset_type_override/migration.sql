-- Add custom asset type override so user-specific classification does not mutate the global asset catalog.
ALTER TABLE "user_asset_overrides" ADD COLUMN "custom_asset_type" "AssetType";
