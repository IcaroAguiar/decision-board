import { Module } from "@nestjs/common";
import { MarketDataController } from "./market-data.controller.js";
import { MarketDataRepository } from "./market-data.repository.js";
import { MarketDataService } from "./market-data.service.js";

@Module({
	controllers: [MarketDataController],
	providers: [MarketDataRepository, MarketDataService],
})
export class MarketDataModule {}
