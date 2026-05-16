import { Module } from "@nestjs/common";
import { AssetRepository } from "./asset.repository.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

@Module({
	controllers: [AssetsController],
	providers: [AssetRepository, AssetsService],
})
export class AssetsModule {}
