import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AUTH_ROUTE_PATTERN, SET_COOKIE_HEADER_NAME } from "./auth.constants.js";
import { auth } from "./auth.js";

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

interface ExpressRouteHost {
	all(path: string, handler: NodeHandler): void;
}

interface ExpressIncomingMessage extends IncomingMessage {
	baseUrl?: string;
	originalUrl?: string;
	protocol?: string;
}

const AUTH_TOKEN_RESPONSE_FIELD = "token";
const HTTP_PROTOCOL = "http";
const HTTPS_PROTOCOL = "https";
const HTTP2_PSEUDO_HEADER_PREFIX = ":";
type SupportedHttpProtocol = typeof HTTP_PROTOCOL | typeof HTTPS_PROTOCOL;

function getFirstHeaderValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function constructRelativeUrl(request: ExpressIncomingMessage): string {
	const baseUrl = request.baseUrl;
	const originalUrl = request.originalUrl;

	if (!baseUrl || !originalUrl) {
		return baseUrl ? baseUrl + request.url : (request.url ?? "");
	}

	if (baseUrl + request.url === originalUrl) {
		return baseUrl + request.url;
	}

	return originalUrl.split("?")[0]?.at(-1) === "/" ? baseUrl + request.url : baseUrl;
}

function toWebHeaders(headers: IncomingHttpHeaders): Headers {
	const webHeaders = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (key.startsWith(HTTP2_PSEUDO_HEADER_PREFIX)) {
			continue;
		}

		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				webHeaders.append(key, item);
			}
			continue;
		}

		webHeaders.set(key, value);
	}

	return webHeaders;
}

function shouldForwardRequestBody(request: IncomingMessage): boolean {
	if (request.method === "GET" || request.method === "HEAD") {
		return false;
	}

	if (!request.headers["content-type"]) {
		return false;
	}

	const contentLength = Number(request.headers["content-length"]);

	if (
		request.httpVersionMajor === 1 &&
		Number.isNaN(contentLength) &&
		request.headers["transfer-encoding"] == null
	) {
		return false;
	}

	return contentLength !== 0;
}

function isSupportedHttpProtocol(value: unknown): value is SupportedHttpProtocol {
	return value === HTTP_PROTOCOL || value === HTTPS_PROTOCOL;
}

export function resolveAuthRequestProtocol(request: IncomingMessage): SupportedHttpProtocol {
	const expressProtocol = (request as ExpressIncomingMessage).protocol;

	if (isSupportedHttpProtocol(expressProtocol)) {
		return expressProtocol;
	}

	return (request.socket as { encrypted?: boolean }).encrypted ? HTTPS_PROTOCOL : HTTP_PROTOCOL;
}

function toWebRequest(request: IncomingMessage): Request {
	const host = getFirstHeaderValue(request.headers[":authority"]) ?? request.headers.host;
	const protocol = resolveAuthRequestProtocol(request);
	const body = shouldForwardRequestBody(request)
		? (Readable.toWeb(request) as ReadableStream<Uint8Array>)
		: undefined;

	return new Request(`${protocol}://${host}${constructRelativeUrl(request)}`, {
		body,
		duplex: body ? "half" : undefined,
		headers: toWebHeaders(request.headers),
		method: request.method,
	} as RequestInit & { duplex?: "half" });
}

function removeAuthTokensFromPayload(payload: unknown): unknown {
	if (Array.isArray(payload)) {
		return payload.map(removeAuthTokensFromPayload);
	}

	if (!payload || typeof payload !== "object") {
		return payload;
	}

	return Object.fromEntries(
		Object.entries(payload as Record<string, unknown>)
			.filter(([key]) => key !== AUTH_TOKEN_RESPONSE_FIELD)
			.map(([key, value]) => [key, removeAuthTokensFromPayload(value)]),
	);
}

function sanitizeAuthJsonResponseBody(body: Buffer): Buffer {
	if (body.length === 0) {
		return body;
	}

	try {
		return Buffer.from(
			JSON.stringify(removeAuthTokensFromPayload(JSON.parse(body.toString("utf8")) as unknown)),
		);
	} catch {
		return body;
	}
}

function getSetCookieHeaders(headers: Headers): string[] {
	const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
	const setCookieHeaders = headersWithSetCookie.getSetCookie?.();

	if (setCookieHeaders?.length) {
		return setCookieHeaders;
	}

	const setCookieHeader = headers.get(SET_COOKIE_HEADER_NAME);
	return setCookieHeader ? [setCookieHeader] : [];
}

async function writeWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
	const body = webResponse.body
		? sanitizeAuthJsonResponseBody(Buffer.from(await webResponse.arrayBuffer()))
		: undefined;

	for (const [key, value] of webResponse.headers) {
		if (key.toLowerCase() !== SET_COOKIE_HEADER_NAME) {
			response.setHeader(key, value);
		}
	}

	const setCookieHeaders = getSetCookieHeaders(webResponse.headers);

	if (setCookieHeaders.length > 0) {
		response.setHeader(SET_COOKIE_HEADER_NAME, setCookieHeaders);
	}

	if (body) {
		response.setHeader("content-length", String(body.byteLength));
	}

	response.statusCode = webResponse.status;
	response.end(body);
}

function createCookieOnlyAuthHandler(): NodeHandler {
	return async (request, response) => {
		await writeWebResponse(response, await auth.handler(toWebRequest(request)));
	};
}

export function mountAuthHandler(app: NestExpressApplication): void {
	const expressApp = app.getHttpAdapter().getInstance() as ExpressRouteHost;

	expressApp.all(AUTH_ROUTE_PATTERN, createCookieOnlyAuthHandler());
}
