import { Module } from "@nestjs/common";
import { ContributionCycleRepository } from "./contribution-cycle.repository.js";
import { ContributionCyclesController } from "./contribution-cycles.controller.js";
import { ContributionCyclesService } from "./contribution-cycles.service.js";

@Module({
	controllers: [ContributionCyclesController],
	providers: [ContributionCycleRepository, ContributionCyclesService],
})
export class ContributionCyclesModule {}
