import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseCreateManualPriceSnapshotDto,
	parseMarketDataAssetId,
	parsePriceSnapshotSearchDto,
} from "./market-data.dto.js";
import { MarketDataService, type PriceSnapshotResponse } from "./market-data.service.js";

@Controller("assets/:assetId/price-snapshots")
export class MarketDataController {
	constructor(
		@Inject(MarketDataService)
		private readonly marketData: MarketDataService,
	) {}

	@Post()
	async createManualPriceSnapshot(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("assetId") assetId: string,
		@Body() body: unknown,
	): Promise<PriceSnapshotResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.marketData.createManualPriceSnapshot(
			user.userId,
			parseMarketDataAssetId(assetId),
			parseCreateManualPriceSnapshotDto(body),
		);
	}

	@Post("refresh")
	async refreshPriceSnapshotFromProvider(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("assetId") assetId: string,
	): Promise<PriceSnapshotResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.marketData.refreshPriceSnapshotFromProvider(
			user.userId,
			parseMarketDataAssetId(assetId),
		);
	}

	@Get()
	async listPriceSnapshots(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("assetId") assetId: string,
		@Query() query: unknown,
	): Promise<PriceSnapshotResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.marketData.listPriceSnapshots(
			user.userId,
			parseMarketDataAssetId(assetId),
			parsePriceSnapshotSearchDto(query),
		);
	}
}
