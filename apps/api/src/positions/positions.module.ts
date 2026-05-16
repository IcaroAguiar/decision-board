import { Module } from "@nestjs/common";
import { PositionRepository } from "./position.repository.js";
import { PositionsController } from "./positions.controller.js";
import { PositionsService } from "./positions.service.js";

@Module({
	controllers: [PositionsController],
	providers: [PositionRepository, PositionsService],
})
export class PositionsModule {}
