import { Module } from "@nestjs/common";
import { MeController } from "./auth/me.controller.js";
import { HealthController } from "./health.controller.js";

@Module({
	controllers: [HealthController, MeController],
})
export class AppModule {}
