import { Module } from "@nestjs/common";
import { PortfolioRepository } from "./portfolio.repository.js";
import { PortfoliosController } from "./portfolios.controller.js";
import { PortfoliosService } from "./portfolios.service.js";

@Module({
	controllers: [PortfoliosController],
	providers: [PortfolioRepository, PortfoliosService],
})
export class PortfoliosModule {}
