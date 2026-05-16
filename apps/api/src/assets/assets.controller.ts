import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "../auth/authenticated-request.js";
import {
	parseAssetId,
	parseAssetSearchDto,
	parseCreateAssetDto,
	parseUpsertAssetOverrideDto,
} from "./asset.dto.js";
import { type AssetResponse, AssetsService } from "./assets.service.js";

@Controller("assets")
export class AssetsController {
	constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

	@Post()
	async createAsset(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Body() body: unknown,
	): Promise<AssetResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.assets.createAsset(user.userId, parseCreateAssetDto(body));
	}

	@Get()
	async listAssets(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Query() query: unknown,
	): Promise<AssetResponse[]> {
		const user = await requireAuthenticatedUser(request, response);
		return this.assets.listAssets(user.userId, parseAssetSearchDto(query));
	}

	@Get(":assetId")
	async getAsset(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("assetId") assetId: string,
	): Promise<AssetResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.assets.getAsset(user.userId, parseAssetId(assetId));
	}

	@Patch(":assetId/override")
	async upsertAssetOverride(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
		@Param("assetId") assetId: string,
		@Body() body: unknown,
	): Promise<AssetResponse> {
		const user = await requireAuthenticatedUser(request, response);
		return this.assets.upsertAssetOverride(
			user.userId,
			parseAssetId(assetId),
			parseUpsertAssetOverrideDto(body),
		);
	}
}
