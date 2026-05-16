import { Module } from "@nestjs/common";
import { MeController } from "./auth/me.controller.js";
import { HealthController } from "./health.controller.js";
import { PortfoliosModule } from "./portfolios/portfolios.module.js";

@Module({
	imports: [PortfoliosModule],
	controllers: [HealthController, MeController],
})
export class AppModule {}
