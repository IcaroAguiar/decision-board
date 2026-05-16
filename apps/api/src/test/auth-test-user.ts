import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSetCookieHeaders, readJson, testWebOrigin, toCookieHeader } from "./http-test-app.js";

export interface TestUser {
	userId: string;
	email: string;
	cookieHeader: string;
}

export async function clearAuthRateLimits(prisma: {
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

export async function signUpTestUser(baseUrl: string, label: string): Promise<TestUser> {
	const email = `test-${label}-${randomUUID()}@example.test`;
	const testCredential = `test-only-${randomUUID()}`;
	const signUp = await fetch(`${baseUrl}/auth/sign-up/email`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: testWebOrigin,
		},
		body: JSON.stringify({
			name: `Test ${label}`,
			email,
			password: testCredential,
		}),
	});
	const signUpPayload = await readJson(signUp);
	assert.equal(signUp.status, 200, JSON.stringify(signUpPayload));

	const cookies = getSetCookieHeaders(signUp);
	assert.ok(cookies.length > 0);
	const cookieHeader = toCookieHeader(cookies);

	const me = await fetch(`${baseUrl}/me`, {
		headers: {
			cookie: cookieHeader,
		},
	});
	assert.equal(me.status, 200);
	const mePayload = assertUserPayload(await readJson(me));

	return {
		userId: mePayload.userId,
		email,
		cookieHeader,
	};
}

export function jsonHeaders(user?: TestUser): Record<string, string> {
	return {
		"content-type": "application/json",
		...(user ? { cookie: user.cookieHeader } : {}),
	};
}

function assertUserPayload(payload: unknown): { userId: string; email: string } {
	assert.ok(isRecord(payload));
	assert.equal(typeof payload.userId, "string");
	assert.equal(typeof payload.email, "string");

	return payload as { userId: string; email: string };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}
