import { Module } from "@nestjs/common";
import { JobsRepository } from "./jobs.repository.js";
import { JobsService } from "./jobs.service.js";

@Module({
	providers: [JobsRepository, JobsService],
	exports: [JobsService],
})
export class JobsModule {}
