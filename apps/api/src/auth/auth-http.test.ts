import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import {
	configureTestEnvironment,
	createTestApp,
	getSetCookieHeaders,
	readJson,
	testWebOrigin,
	toCookieHeader,
} from "../test/http-test-app.js";
import { SESSION_TOKEN_COOKIE_NAME_FRAGMENT } from "./auth.constants.js";
import { authLogger } from "./auth.logger.js";

test("uses Express trusted protocol instead of raw forwarded protocol", async () => {
	configureTestEnvironment();
	const { resolveAuthRequestProtocol } = await import("./auth-http.js");
	const request = new IncomingMessage(new Socket());
	Object.defineProperty(request, "protocol", { value: "http" });
	request.headers["x-forwarded-proto"] = "https";

	assert.equal(resolveAuthRequestProtocol(request), "http");
});

function assertNoAuthTokenPayload(payload: unknown): void {
	if (Array.isArray(payload)) {
		for (const value of payload) {
			assertNoAuthTokenPayload(value);
		}
		return;
	}

	if (!payload || typeof payload !== "object") {
		return;
	}

	for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
		assert.notEqual(key, "token");
		assertNoAuthTokenPayload(value);
	}
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

test("normalizes trusted origins from environment URLs", async () => {
	configureTestEnvironment();
	const previousWebOrigin = process.env.WEB_ORIGIN;
	const previousAuthUrl = process.env.BETTER_AUTH_URL;

	try {
		process.env.WEB_ORIGIN = "http://localhost:5173/";
		process.env.BETTER_AUTH_URL = "http://localhost:3001/auth";

		const { getTrustedOrigins } = await import("./env.js");

		assert.deepEqual(getTrustedOrigins(), ["http://localhost:5173", "http://localhost:3001"]);
	} finally {
		restoreEnv("WEB_ORIGIN", previousWebOrigin);
		restoreEnv("BETTER_AUTH_URL", previousAuthUrl);
	}
});

test("rejects insecure production auth origins", async () => {
	configureTestEnvironment();
	const previousNodeEnv = process.env.NODE_ENV;
	const previousWebOrigin = process.env.WEB_ORIGIN;
	const previousAuthUrl = process.env.BETTER_AUTH_URL;

	try {
		process.env.NODE_ENV = "production";
		process.env.WEB_ORIGIN = "http://localhost:5173/";
		process.env.BETTER_AUTH_URL = "https://api.example.test/auth";

		const { getRequiredPublicOrigin, getTrustedOrigins } = await import("./env.js");

		assert.throws(() => getTrustedOrigins(), /WEB_ORIGIN must use https in production/);

		process.env.WEB_ORIGIN = "https://app.example.test";
		process.env.BETTER_AUTH_URL = "http://localhost:3001";
		assert.throws(
			() => getRequiredPublicOrigin("BETTER_AUTH_URL"),
			/BETTER_AUTH_URL must use https in production/,
		);

		process.env.BETTER_AUTH_URL = "https://api.example.test/auth";
		assert.equal(getRequiredPublicOrigin("BETTER_AUTH_URL"), "https://api.example.test");
		assert.deepEqual(getTrustedOrigins(), ["https://app.example.test", "https://api.example.test"]);
	} finally {
		restoreEnv("NODE_ENV", previousNodeEnv);
		restoreEnv("WEB_ORIGIN", previousWebOrigin);
		restoreEnv("BETTER_AUTH_URL", previousAuthUrl);
	}
});

test("redacts Better Auth log URL payloads", () => {
	const previousWarn = console.warn;
	const loggedMessages: string[] = [];

	console.warn = (message?: unknown): void => {
		loggedMessages.push(String(message));
	};

	try {
		authLogger.log?.(
			"warn",
			"Invalid callbackURL: https://app.example.test/reset?token=raw-value-a&email=user@example.test#fragment",
		);
		authLogger.log?.(
			"warn",
			"Invalid redirectURL: /auth/callback?code=raw-value-b&state=raw-value-c",
		);
	} finally {
		console.warn = previousWarn;
	}

	const output = loggedMessages.join("\n");

	assert.match(output, /https:\/\/app\.example\.test\/reset\?\[redacted-url-payload\]/);
	assert.match(output, /\/auth\/callback\?\[redacted-url-payload\]/);
	assert.doesNotMatch(
		output,
		/raw-value-a|user@example\.test|raw-value-b|raw-value-c|token=|email=|code=|state=|#fragment/,
	);
});

test("coerces non-string Better Auth log messages before redaction", () => {
	const previousError = console.error;
	const loggedMessages: string[] = [];

	console.error = (message?: unknown): void => {
		loggedMessages.push(String(message));
	};

	try {
		authLogger.log?.(
			"error",
			new Error(
				"Invalid callbackURL: https://app.example.test/reset?token=raw-value-a#fragment",
			) as unknown as string,
		);
		authLogger.log?.("error", {
			callbackURL: "https://app.example.test/reset?token=raw",
		} as unknown as string);
	} finally {
		console.error = previousError;
	}

	const output = loggedMessages.join("\n");

	assert.match(output, /https:\/\/app\.example\.test\/reset\?\[redacted-url-payload\]/);
	assert.match(output, /\[non-string auth log message\]/);
	assert.doesNotMatch(output, /raw-value-a|token=|#fragment/);
});

async function clearAuthRateLimits(prisma: {
	rateLimit: {
		deleteMany(args: { where: { key: { contains: string } } }): Promise<unknown>;
	};
}): Promise<void> {
	await Promise.all(
		["/sign-up/email", "/sign-in/email"].map((path) =>
			prisma.rateLimit.deleteMany({
				where: {
					key: {
						contains: path,
					},
				},
			}),
		),
	);
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
		const signUpPayload = await readJson(signUp);
		assert.equal(signUp.status, 200, JSON.stringify(signUpPayload));
		assertNoAuthTokenPayload(signUpPayload);

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
		assertNoAuthTokenPayload(sessionPayload);
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

		const sessionTokenCookie = signUpCookies.find((cookie) =>
			cookie.includes(`${SESSION_TOKEN_COOKIE_NAME_FRAGMENT}=`),
		);
		assert.ok(sessionTokenCookie);
		const dbSession = await prisma.session.findFirstOrThrow({
			where: {
				user: {
					email,
				},
			},
			select: {
				id: true,
			},
		});
		await prisma.session.update({
			where: {
				id: dbSession.id,
			},
			data: {
				expiresAt: new Date(Date.now() + 300_000),
			},
		});
		const refreshedMe = await fetch(`${baseUrl}/me`, {
			headers: {
				cookie: toCookieHeader([sessionTokenCookie]),
			},
		});
		assert.equal(refreshedMe.status, 200);
		assert.deepEqual(await readJson(refreshedMe), {
			userId: (sessionPayload as { user: { id: string } }).user.id,
			email,
		});
		const refreshedCookies = getSetCookieHeaders(refreshedMe);
		assert.ok(
			refreshedCookies.some((cookie) => cookie.includes(SESSION_TOKEN_COOKIE_NAME_FRAGMENT)),
		);

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

		const signIn = await fetch(`${baseUrl}/auth/sign-in/email`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: testWebOrigin,
			},
			body: JSON.stringify({
				email,
				password,
			}),
		});
		const signInPayload = await readJson(signIn);
		assert.equal(signIn.status, 200, JSON.stringify(signInPayload));
		assertNoAuthTokenPayload(signInPayload);

		const signInCookies = getSetCookieHeaders(signIn);
		assert.ok(signInCookies.length > 0);
		const meAfterSignIn = await fetch(`${baseUrl}/me`, {
			headers: {
				cookie: toCookieHeader(signInCookies),
			},
		});
		assert.equal(meAfterSignIn.status, 200);
	} finally {
		await prisma.user.deleteMany({ where: { email } });
		await clearAuthRateLimits(prisma);
		await app.close();
		await prisma.$disconnect();
	}
});
