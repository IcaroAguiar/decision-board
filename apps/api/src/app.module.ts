import { Module } from "@nestjs/common";
import { AssetsModule } from "./assets/assets.module.js";
import { MeController } from "./auth/me.controller.js";
import { CashAccountsModule } from "./cash-accounts/cash-accounts.module.js";
import { ContributionCyclesModule } from "./contribution-cycles/contribution-cycles.module.js";
import { ContributionPlansModule } from "./contribution-plans/contribution-plans.module.js";
import { HealthController } from "./health.controller.js";
import { PortfoliosModule } from "./portfolios/portfolios.module.js";
import { PositionsModule } from "./positions/positions.module.js";

@Module({
	imports: [
		AssetsModule,
		CashAccountsModule,
		ContributionCyclesModule,
		ContributionPlansModule,
		PortfoliosModule,
		PositionsModule,
	],
	controllers: [HealthController, MeController],
})
export class AppModule {}
