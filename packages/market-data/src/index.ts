export interface QuoteSnapshot {
	ticker: string;
	price: string;
	currency: string;
	provider: string;
	capturedAt: Date;
	rawPayload?: QuoteSnapshotRawPayload;
}

export interface QuoteSnapshotRawPayload {
	symbol: string;
	regularMarketPrice: number;
	regularMarketTime?: string;
	currency: string;
}

export interface MarketDataProvider {
	getQuote(ticker: string): Promise<QuoteSnapshot | null>;
	getQuotes(tickers: string[]): Promise<QuoteSnapshot[]>;
}

export interface BrapiMarketDataProviderConfig {
	token?: string;
	baseUrl?: string;
	timeoutMs?: number;
	fetch?: typeof fetch;
	now?: () => Date;
}

export interface ManualQuoteSnapshotInput {
	ticker: string;
	price: string;
	currency: string;
	capturedAt?: Date;
}

const DEFAULT_BRAPI_BASE_URL = "https://brapi.dev";
const DEFAULT_BRAPI_TIMEOUT_MS = 5000;
const BRAPI_QUOTE_PATH = "/api/quote/";
const DEFAULT_CURRENCY = "BRL";
const ABORT_ERROR_NAME = "AbortError";
const BRAPI_INVALID_RESPONSE_CODE = "BRAPI_INVALID_RESPONSE";
const BRAPI_NETWORK_ERROR_CODE = "BRAPI_NETWORK_ERROR";
const BRAPI_REQUEST_FAILED_CODE = "BRAPI_REQUEST_FAILED";
const BRAPI_TIMEOUT_CODE = "BRAPI_TIMEOUT";
const TICKER_PATTERN = /^[A-Z0-9.]{1,24}$/;

export const manualMarketDataProviderName = "manual";
export const brapiMarketDataProviderName = "brapi";

export class MarketDataProviderError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "MarketDataProviderError";
	}
}

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

export class BrapiMarketDataProvider implements MarketDataProvider {
	private readonly baseUrl: URL;
	private readonly timeoutMs: number;
	private readonly fetcher: typeof fetch;
	private readonly now: () => Date;
	private readonly token?: string;

	constructor(config: BrapiMarketDataProviderConfig = {}) {
		this.baseUrl = parseBaseUrl(config.baseUrl ?? DEFAULT_BRAPI_BASE_URL);
		this.timeoutMs = config.timeoutMs ?? DEFAULT_BRAPI_TIMEOUT_MS;
		this.fetcher = config.fetch ?? globalThis.fetch;
		this.now = config.now ?? (() => new Date());
		this.token = normalizeOptionalText(config.token);
	}

	async getQuote(ticker: string): Promise<QuoteSnapshot | null> {
		const [quote] = await this.getQuotes([ticker]);
		return quote ?? null;
	}

	async getQuotes(tickers: string[]): Promise<QuoteSnapshot[]> {
		const normalizedTickers = normalizeTickers(tickers);
		if (normalizedTickers.length === 0) {
			return [];
		}

		const response = await this.fetchQuote(normalizedTickers);
		return parseBrapiQuoteResponse(response, this.now);
	}

	private async fetchQuote(tickers: string[]): Promise<unknown> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetcher(this.buildQuoteUrl(tickers), {
				headers: this.token ? { authorization: `Bearer ${this.token}` } : undefined,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new MarketDataProviderError(
					`brapi quote request failed with status ${response.status}`,
					BRAPI_REQUEST_FAILED_CODE,
					response.status,
				);
			}

			return response.json();
		} catch (error) {
			if (error instanceof MarketDataProviderError) {
				throw error;
			}

			if (isAbortError(error)) {
				throw new MarketDataProviderError("brapi quote request timed out", BRAPI_TIMEOUT_CODE);
			}

			throw new MarketDataProviderError("brapi quote request failed", BRAPI_NETWORK_ERROR_CODE);
		} finally {
			clearTimeout(timeout);
		}
	}

	private buildQuoteUrl(tickers: string[]): URL {
		const encodedTickers = tickers.map((ticker) => encodeURIComponent(ticker)).join(",");
		const url = new URL(BRAPI_QUOTE_PATH + encodedTickers, this.baseUrl);
		return url;
	}
}

function normalizeOptionalText(value: string | undefined): string | undefined {
	const text = value?.trim();
	return text ? text : undefined;
}

function parseBaseUrl(value: string): URL {
	const url = new URL(value);
	if (url.protocol === "https:" || isLoopbackHttpUrl(url)) {
		return url;
	}

	throw new MarketDataProviderError(
		"baseUrl must use https or loopback http",
		"BRAPI_INVALID_BASE_URL",
	);
}

function normalizeTickers(tickers: string[]): string[] {
	return tickers
		.map((ticker) => ticker.trim().toUpperCase())
		.filter(Boolean)
		.map(assertSupportedTicker);
}

function parseBrapiQuoteResponse(payload: unknown, now: () => Date): QuoteSnapshot[] {
	const response = readRecord(payload, "brapi response");
	const results = response.results;

	if (!Array.isArray(results)) {
		throw new MarketDataProviderError(
			"brapi response is missing results",
			BRAPI_INVALID_RESPONSE_CODE,
		);
	}

	return results.map((quote) => parseBrapiQuote(quote, now));
}

function parseBrapiQuote(payload: unknown, now: () => Date): QuoteSnapshot {
	const quote = readRecord(payload, "brapi quote");
	const ticker = assertSupportedTicker(readString(quote.symbol, "symbol").toUpperCase());
	const price = readPositiveNumber(quote.regularMarketPrice, "regularMarketPrice");
	const currency =
		quote.currency === undefined
			? DEFAULT_CURRENCY
			: readString(quote.currency, "currency").toUpperCase();
	const regularMarketTime =
		quote.regularMarketTime === undefined
			? undefined
			: readString(quote.regularMarketTime, "regularMarketTime");

	return {
		ticker,
		price: price.toString(),
		currency,
		provider: brapiMarketDataProviderName,
		capturedAt: readTimestamp(regularMarketTime, now),
		rawPayload: {
			symbol: ticker,
			regularMarketPrice: price,
			...(regularMarketTime ? { regularMarketTime } : {}),
			currency,
		},
	};
}

function assertSupportedTicker(ticker: string): string {
	if (!TICKER_PATTERN.test(ticker)) {
		throw new MarketDataProviderError("ticker is not supported by brapi", "BRAPI_INVALID_TICKER");
	}

	return ticker;
}

function readRecord(payload: unknown, label: string): Record<string, unknown> {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new MarketDataProviderError(`${label} must be an object`, BRAPI_INVALID_RESPONSE_CODE);
	}

	return payload as Record<string, unknown>;
}

function readString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new MarketDataProviderError(`${field} must be a string`, BRAPI_INVALID_RESPONSE_CODE);
	}

	return value.trim();
}

function readPositiveNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new MarketDataProviderError(
			`${field} must be a positive number`,
			BRAPI_INVALID_RESPONSE_CODE,
		);
	}

	return value;
}

function readTimestamp(value: unknown, now: () => Date): Date {
	if (typeof value !== "string") {
		return now();
	}

	const capturedAt = new Date(value);
	return Number.isNaN(capturedAt.getTime()) ? now() : capturedAt;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

function isLoopbackHttpUrl(url: URL): boolean {
	return (
		url.protocol === "http:" &&
		(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
	);
}
