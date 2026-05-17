import { Module } from "@nestjs/common";
import { ContributionPlanRepository } from "./contribution-plan.repository.js";
import { ContributionPlansController } from "./contribution-plans.controller.js";
import { ContributionPlansService } from "./contribution-plans.service.js";

@Module({
	controllers: [ContributionPlansController],
	providers: [ContributionPlanRepository, ContributionPlansService],
})
export class ContributionPlansModule {}
