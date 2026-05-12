export interface QuoteSnapshot {
	ticker: string;
	price: number;
	currency: string;
	provider: string;
	capturedAt: Date;
	rawPayload?: unknown;
}

export interface MarketDataProvider {
	getQuote(ticker: string): Promise<QuoteSnapshot | null>;
	getQuotes(tickers: string[]): Promise<QuoteSnapshot[]>;
}

export class ManualMarketDataProvider implements MarketDataProvider {
	async getQuote(_ticker: string): Promise<QuoteSnapshot | null> {
		return null;
	}

	async getQuotes(_tickers: string[]): Promise<QuoteSnapshot[]> {
		return [];
	}
}
