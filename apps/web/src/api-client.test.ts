import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, apiRequestAllowUnauthorized, getErrorMessage } from "./api-client.js";

function jsonResponse(status: number, body: unknown): Response {
	if (body === undefined) {
		return new Response(null, { status });
	}

	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		status,
	});
}

async function withFetch<T>(impl: () => Promise<Response>, run: () => Promise<T>): Promise<T> {
	const original = globalThis.fetch;
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		assert.equal(init?.credentials, "include");
		return impl();
	}) as typeof fetch;

	try {
		return await run();
	} finally {
		globalThis.fetch = original;
	}
}

test("apiRequestAllowUnauthorized returns null on 401", async () => {
	const result = await withFetch(
		async () => jsonResponse(401, { message: "Unauthorized" }),
		() => apiRequestAllowUnauthorized("http://api.test", "/me"),
	);
	assert.equal(result, null);
});

test("apiRequestAllowUnauthorized throws joined Nest message arrays", async () => {
	await assert.rejects(
		() =>
			withFetch(
				async () => jsonResponse(400, { message: ["ticker required", "name required"] }),
				() => apiRequestAllowUnauthorized("http://api.test", "/me"),
			),
		(error: unknown) => {
			assert.equal(getErrorMessage(error, "fallback"), "ticker required; name required");
			return true;
		},
	);
});

test("apiRequest returns undefined for 204 and empty 200 bodies", async () => {
	const empty = await withFetch(
		async () => jsonResponse(204, undefined),
		() => apiRequest("http://api.test", "/auth/sign-out", { method: "POST" }),
	);
	assert.equal(empty, undefined);

	const blank = await withFetch(
		async () => new Response("", { status: 200 }),
		() => apiRequest("http://api.test", "/empty"),
	);
	assert.equal(blank, undefined);
});

test("apiRequest throws on non-OK responses", async () => {
	await assert.rejects(
		() =>
			withFetch(
				async () => jsonResponse(500, { message: "boom" }),
				() => apiRequest("http://api.test", "/fail"),
			),
		(error: unknown) => {
			assert.equal(getErrorMessage(error, "fallback"), "boom");
			return true;
		},
	);
});
