import assert from "node:assert/strict";
import test from "node:test";
import { getRequiredEnv, getRequiredPublicOrigin, getTrustedOrigins } from "./env.js";

const REQUIRED_ENV_NAME = "DECISION_BOARD_REQUIRED_TEST_VALUE";
const WEB_ORIGIN_ENV_NAME = "WEB_ORIGIN";
const BETTER_AUTH_URL_ENV_NAME = "BETTER_AUTH_URL";
const NODE_ENV_NAME = "NODE_ENV";
const TEST_ORIGIN = "https://app.example.test";
const TEST_ORIGIN_PATH = `${TEST_ORIGIN}/path`;
const TEST_ORIGIN_DASHBOARD_URL = `${TEST_ORIGIN}/dashboard`;
const TEST_ORIGIN_AUTH_URL = `${TEST_ORIGIN}/auth`;
const INSECURE_AUTH_URL = "http://app.example.test/auth";
const INVALID_URL_VALUE = "not-a-url";
const REQUIRED_ENV_ERROR_PATTERN = /DECISION_BOARD_REQUIRED_TEST_VALUE is required/;
const HTTPS_PRODUCTION_ERROR_PATTERN =
	/DECISION_BOARD_REQUIRED_TEST_VALUE must use https in production/;
const INVALID_URL_ERROR_PATTERN = /Invalid URL/;

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

test("requires configured environment values before deriving public origins", () => {
	const previousRequiredValue = process.env[REQUIRED_ENV_NAME];
	const previousNodeEnv = process.env[NODE_ENV_NAME];

	try {
		delete process.env[REQUIRED_ENV_NAME];
		delete process.env[NODE_ENV_NAME];

		assert.throws(() => getRequiredEnv(REQUIRED_ENV_NAME), REQUIRED_ENV_ERROR_PATTERN);
		assert.throws(() => getRequiredPublicOrigin(REQUIRED_ENV_NAME), REQUIRED_ENV_ERROR_PATTERN);

		process.env[REQUIRED_ENV_NAME] = TEST_ORIGIN_PATH;
		assert.equal(getRequiredEnv(REQUIRED_ENV_NAME), TEST_ORIGIN_PATH);
		assert.equal(getRequiredPublicOrigin(REQUIRED_ENV_NAME), TEST_ORIGIN);

		process.env.NODE_ENV = "production";
		process.env[REQUIRED_ENV_NAME] = INSECURE_AUTH_URL;
		assert.throws(() => getRequiredPublicOrigin(REQUIRED_ENV_NAME), HTTPS_PRODUCTION_ERROR_PATTERN);
	} finally {
		restoreEnv(REQUIRED_ENV_NAME, previousRequiredValue);
		restoreEnv(NODE_ENV_NAME, previousNodeEnv);
	}
});

test("returns trusted origins only from configured public URL values", () => {
	const previousWebOrigin = process.env[WEB_ORIGIN_ENV_NAME];
	const previousAuthUrl = process.env[BETTER_AUTH_URL_ENV_NAME];
	const previousNodeEnv = process.env[NODE_ENV_NAME];

	try {
		delete process.env[WEB_ORIGIN_ENV_NAME];
		delete process.env[BETTER_AUTH_URL_ENV_NAME];
		delete process.env[NODE_ENV_NAME];

		assert.deepEqual(getTrustedOrigins(), []);

		process.env[WEB_ORIGIN_ENV_NAME] = TEST_ORIGIN_DASHBOARD_URL;
		process.env[BETTER_AUTH_URL_ENV_NAME] = TEST_ORIGIN_AUTH_URL;
		assert.deepEqual(getTrustedOrigins(), [TEST_ORIGIN]);

		process.env[BETTER_AUTH_URL_ENV_NAME] = INVALID_URL_VALUE;
		assert.throws(() => getTrustedOrigins(), INVALID_URL_ERROR_PATTERN);
	} finally {
		restoreEnv(WEB_ORIGIN_ENV_NAME, previousWebOrigin);
		restoreEnv(BETTER_AUTH_URL_ENV_NAME, previousAuthUrl);
		restoreEnv(NODE_ENV_NAME, previousNodeEnv);
	}
});
