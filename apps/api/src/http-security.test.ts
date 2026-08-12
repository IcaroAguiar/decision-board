import assert from "node:assert/strict";
import test from "node:test";
import { apiHelmetOptions } from "./http-security.js";
import { createTestApp } from "./test/http-test-app.js";

test("API Helmet options keep CSP enabled with default-src none", () => {
	assert.notEqual(apiHelmetOptions.contentSecurityPolicy, false);
	const serialized = JSON.stringify(apiHelmetOptions);
	assert.match(serialized, /"defaultSrc":\["'none'"\]/);
	assert.match(serialized, /"policy":"cross-origin"/);
});

test("createTestApp serves Helmet CSP and CORP on /health", async () => {
	const { app, baseUrl } = await createTestApp();

	try {
		const response = await fetch(`${baseUrl}/health`);
		assert.equal(response.status, 200);
		assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
		assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
	} finally {
		await app.close();
	}
});
