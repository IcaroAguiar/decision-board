import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { UserAssetOverride } from "@prisma/client";
import type { AssetSearchDto, CreateAssetDto, UpsertAssetOverrideDto } from "./asset.dto.js";
import { AssetRepository, type AssetWithUserOverride } from "./asset.repository.js";

export interface AssetOverrideResponse {
	customName: string | null;
	customAssetType: string | null;
	customSegment: string | null;
	customRiskCategory: string | null;
	notes: string | null;
}

export interface AssetResponse {
	id: string;
	ticker: string;
	name: string;
	assetType: string;
	riskCategory: string;
	segment: string | null;
	currency: string;
	exchange: string | null;
	isActive: boolean;
	effectiveName: string;
	effectiveAssetType: string;
	effectiveSegment: string | null;
	effectiveRiskCategory: string;
	userOverride: AssetOverrideResponse | null;
	createdAt: string;
	updatedAt: string;
}

@Injectable()
export class AssetsService {
	constructor(@Inject(AssetRepository) private readonly assets: AssetRepository) {}

	async createAsset(userId: string, data: CreateAssetDto): Promise<AssetResponse> {
		const asset = await this.assets.findOrCreateCanonical(data);
		const assetWithOverride = await this.assets.upsertOverride(userId, asset.id, {
			customName: data.name,
			customAssetType: data.assetType,
			customSegment: data.segment ?? null,
			customRiskCategory: data.riskCategory,
		});

		return toAssetResponse(assertAssetFound(assetWithOverride));
	}

	async listAssets(userId: string, filters: AssetSearchDto): Promise<AssetResponse[]> {
		const assets = await this.assets.findManyForUser(userId, filters);
		return assets.map(toAssetResponse);
	}

	async getAsset(userId: string, assetId: string): Promise<AssetResponse> {
		const asset = await this.assets.findByIdForUser(userId, assetId);

		if (!asset) {
			throw new NotFoundException("Asset not found");
		}

		return toAssetResponse(asset);
	}

	async upsertAssetOverride(
		userId: string,
		assetId: string,
		data: UpsertAssetOverrideDto,
	): Promise<AssetResponse> {
		const asset = await this.assets.upsertOverride(userId, assetId, data);

		if (!asset) {
			throw new NotFoundException("Asset not found");
		}

		return toAssetResponse(asset);
	}
}

function assertAssetFound(asset: AssetWithUserOverride | null): AssetWithUserOverride {
	if (!asset) {
		throw new NotFoundException("Asset not found");
	}

	return asset;
}

function toAssetResponse(asset: AssetWithUserOverride): AssetResponse {
	const override = asset.userAssetOverrides[0] ?? null;
	const overrideResponse = override ? toOverrideResponse(override) : null;

	return {
		id: asset.id,
		ticker: asset.ticker,
		name: asset.name,
		assetType: asset.assetType,
		riskCategory: asset.riskCategory,
		segment: asset.segment,
		currency: asset.currency,
		exchange: asset.exchange,
		isActive: asset.isActive,
		effectiveName: override?.customName ?? asset.name,
		effectiveAssetType: override?.customAssetType ?? asset.assetType,
		effectiveSegment: override?.customSegment ?? asset.segment,
		effectiveRiskCategory: override?.customRiskCategory ?? asset.riskCategory,
		userOverride: overrideResponse,
		createdAt: asset.createdAt.toISOString(),
		updatedAt: asset.updatedAt.toISOString(),
	};
}

function toOverrideResponse(override: UserAssetOverride): AssetOverrideResponse {
	return {
		customName: override.customName,
		customAssetType: override.customAssetType,
		customSegment: override.customSegment,
		customRiskCategory: override.customRiskCategory,
		notes: override.notes,
	};
}
