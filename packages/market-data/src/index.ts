export interface QuoteSnapshot {
	ticker: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: Date;
	rawPayload?: unknown;
}

export interface MarketDataProvider {
	getQuote(ticker: string): Promise<QuoteSnapshot | null>;
	getQuotes(tickers: string[]): Promise<QuoteSnapshot[]>;
}

export interface ManualQuoteSnapshotInput {
	ticker: string;
	price: string;
	currency: string;
	capturedAt?: Date;
}

export const manualMarketDataProviderName = "manual";

export class ManualMarketDataProvider implements MarketDataProvider {
	createQuoteSnapshot(input: ManualQuoteSnapshotInput): QuoteSnapshot {
		return {
			ticker: input.ticker,
			price: input.price,
			currency: input.currency,
			provider: manualMarketDataProviderName,
			capturedAt: input.capturedAt ?? new Date(),
		};
	}

	async getQuote(_ticker: string): Promise<QuoteSnapshot | null> {
		return null;
	}

	async getQuotes(_tickers: string[]): Promise<QuoteSnapshot[]> {
		return [];
	}
}
