import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { NestExpressApplication } from "@nestjs/platform-express";

export const testWebOrigin = "http://localhost:5173";

export function configureTestEnvironment(): void {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required for API integration tests");
	}

	process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
	process.env.BETTER_AUTH_SECRET ??= "test-only-auth-key-at-least-32-characters";
	process.env.WEB_ORIGIN ??= testWebOrigin;
	process.env.JOBS_ENABLED = "false";
	process.env.NODE_ENV ??= "test";
}

export async function createTestApp(): Promise<{
	app: NestExpressApplication;
	baseUrl: string;
}> {
	configureTestEnvironment();

	const [{ NestFactory }, { AppModule }, { mountAuthHandler }, { getTrustedOrigins }] =
		await Promise.all([
			import("@nestjs/core"),
			import("../app.module.js"),
			import("../auth/auth-http.js"),
			import("../auth/env.js"),
		]);

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bodyParser: false,
		logger: false,
	});

	app.enableCors({
		credentials: true,
		origin: getTrustedOrigins(),
	});
	const { normalizeClientIpForAuth } = await import("../auth/client-ip.js");
	normalizeClientIpForAuth(app);
	mountAuthHandler(app);
	app.useBodyParser("json");
	app.useBodyParser("urlencoded", { extended: true });

	await app.listen(0, "127.0.0.1");

	const address = app.getHttpServer().address();
	assertAddressInfo(address);

	return {
		app,
		baseUrl: `http://127.0.0.1:${address.port}`,
	};
}

export async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();

	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error(`Expected JSON response, got ${response.status}: ${text}`, {
			cause: error,
		});
	}
}

export function getSetCookieHeaders(response: Response): string[] {
	const headers = response.headers as Headers & { getSetCookie?: () => string[] };
	const cookies = headers.getSetCookie?.();

	if (cookies?.length) {
		return cookies;
	}

	const cookie = response.headers.get("set-cookie");
	return cookie ? [cookie] : [];
}

export function toCookieHeader(setCookieHeaders: string[]): string {
	return setCookieHeaders.map((cookie) => cookie.split(";")[0]).join("; ");
}

function assertAddressInfo(address: AddressInfo | string | null): asserts address is AddressInfo {
	assert.notEqual(address, null);
	assert.notEqual(typeof address, "string");
}
