import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { NestExpressApplication } from "@nestjs/platform-express";

const localDatabaseUrl =
	"postgresql://decision_board:decision_board@localhost:55432/decision_board?schema=public";
const testWebOrigin = "http://localhost:5173";

function configureTestEnvironment(): void {
	process.env.DATABASE_URL ??= localDatabaseUrl;
	process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
	process.env.BETTER_AUTH_SECRET ??= "test-only-auth-key-at-least-32-characters";
	process.env.WEB_ORIGIN ??= testWebOrigin;
	process.env.NODE_ENV ??= "test";
}

async function createTestApp(): Promise<{
	app: NestExpressApplication;
	baseUrl: string;
}> {
	configureTestEnvironment();

	const [{ NestFactory }, { AppModule }, { mountAuthHandler }, { getTrustedOrigins }] =
		await Promise.all([
			import("@nestjs/core"),
			import("../app.module.js"),
			import("./auth-http.js"),
			import("./env.js"),
		]);

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bodyParser: false,
		logger: false,
	});

	app.enableCors({
		credentials: true,
		origin: getTrustedOrigins(),
	});
	const { normalizeClientIpForAuth } = await import("./client-ip.js");
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

async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();

	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new Error(`Expected JSON response, got ${response.status}: ${text}`, {
			cause: error,
		});
	}
}

function getSetCookieHeaders(response: Response): string[] {
	const headers = response.headers as Headers & { getSetCookie?: () => string[] };
	const cookies = headers.getSetCookie?.();

	if (cookies?.length) {
		return cookies;
	}

	const cookie = response.headers.get("set-cookie");
	return cookie ? [cookie] : [];
}

function toCookieHeader(setCookieHeaders: string[]): string {
	return setCookieHeaders.map((cookie) => cookie.split(";")[0]).join("; ");
}

function assertAddressInfo(address: AddressInfo | string | null): asserts address is AddressInfo {
	assert.notEqual(address, null);
	assert.notEqual(typeof address, "string");
}

async function clearAuthRateLimits(prisma: {
	rateLimit: {
		deleteMany(args: { where: { key: { contains: string } } }): Promise<unknown>;
	};
}): Promise<void> {
	await prisma.rateLimit.deleteMany({
		where: {
			key: {
				contains: "/sign-up/email",
			},
		},
	});
}

test("supports Better Auth sign-up, session, API identity, and sign-out", async () => {
	const { app, baseUrl } = await createTestApp();
	const email = `auth-${randomUUID()}@example.test`;
	const password = "correct horse battery staple";

	const { prisma } = await import("./prisma.client.js");

	try {
		await prisma.user.deleteMany({ where: { email } });
		await clearAuthRateLimits(prisma);

		const anonymousMe = await fetch(`${baseUrl}/me`);
		assert.equal(anonymousMe.status, 401);

		const ok = await fetch(`${baseUrl}/auth/ok`);
		assert.equal(ok.status, 200);
		assert.deepEqual(await readJson(ok), { ok: true });

		const signUp = await fetch(`${baseUrl}/auth/sign-up/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: testWebOrigin,
				"x-forwarded-for": "203.0.113.10",
			},
			body: JSON.stringify({
				name: "Decision Board User",
				email,
				password,
			}),
		});
		assert.equal(signUp.status, 200, JSON.stringify(await readJson(signUp)));

		const signUpCookies = getSetCookieHeaders(signUp);
		assert.ok(signUpCookies.length > 0);
		assert.ok(signUpCookies.some((cookie) => /httponly/i.test(cookie)));
		const signUpRateLimits = await prisma.rateLimit.findMany({
			where: {
				key: {
					contains: "/sign-up/email",
				},
			},
			select: {
				key: true,
			},
		});
		assert.ok(signUpRateLimits.length > 0);
		assert.ok(signUpRateLimits.every((entry) => !entry.key.startsWith("203.0.113.10|")));

		const cookieHeader = toCookieHeader(signUpCookies);
		const session = await fetch(`${baseUrl}/auth/get-session`, {
			headers: {
				cookie: cookieHeader,
			},
		});
		assert.equal(session.status, 200);

		const sessionPayload = await readJson(session);
		assert.equal(typeof sessionPayload, "object");
		assert.notEqual(sessionPayload, null);
		assert.equal((sessionPayload as { user?: { email?: string } }).user?.email, email);

		const me = await fetch(`${baseUrl}/me`, {
			headers: {
				cookie: cookieHeader,
			},
		});
		assert.equal(me.status, 200);
		assert.deepEqual(await readJson(me), {
			userId: (sessionPayload as { user: { id: string } }).user.id,
			email,
		});

		const signOut = await fetch(`${baseUrl}/auth/sign-out`, {
			method: "POST",
			headers: {
				cookie: cookieHeader,
				origin: testWebOrigin,
			},
		});
		assert.equal(signOut.status, 200);
		assert.deepEqual(await readJson(signOut), { success: true });

		const meAfterSignOut = await fetch(`${baseUrl}/me`, {
			headers: {
				cookie: cookieHeader,
			},
		});
		assert.equal(meAfterSignOut.status, 401);
	} finally {
		await prisma.user.deleteMany({ where: { email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
