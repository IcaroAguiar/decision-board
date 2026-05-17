import assert from "node:assert/strict";
import test from "node:test";
import { authLogger, sanitizeAuthLogMessage } from "./auth.logger.js";

test("redacts auth URL payloads while preserving safe URL context", () => {
	const sanitized = sanitizeAuthLogMessage(
		"Open https://app.example.test/reset?token=placeholder-a&email=person@example.test).",
	);

	assert.equal(sanitized, "Open https://app.example.test/reset?[redacted-url-payload]).");
	assert.doesNotMatch(sanitized, /placeholder-a|person@example\.test|token=|email=/);
});

test("redacts relative URL query and hash payloads", () => {
	const sanitized = sanitizeAuthLogMessage(
		"Callbacks: /auth/callback?code=placeholder-a and ../reset#token=placeholder-b",
	);

	assert.equal(
		sanitized,
		"Callbacks: /auth/callback?[redacted-url-payload] and ../reset?[redacted-url-payload]",
	);
	assert.doesNotMatch(sanitized, /placeholder-a|placeholder-b|code=|token=/);
});

test("leaves safe URLs without payload unchanged", () => {
	assert.equal(
		sanitizeAuthLogMessage("Visit https://app.example.test/login."),
		"Visit https://app.example.test/login.",
	);
});

test("redacts sensitive assignments outside URL payloads", () => {
	const sanitized = sanitizeAuthLogMessage(
		"token=placeholder-a email=person@example.test callbackURL=https://app.example.test/auth",
	);

	assert.equal(sanitized, "token=[redacted] email=[redacted] callbackURL=[redacted]");
});

test("coerces auth log messages without leaking object payloads", () => {
	assert.equal(sanitizeAuthLogMessage(new Error("")), "Error");
	assert.equal(
		sanitizeAuthLogMessage({
			token: "placeholder-a",
		}),
		"[non-string auth log message]",
	);
	assert.equal(sanitizeAuthLogMessage(null), "");
	assert.equal(sanitizeAuthLogMessage(42), "42");
});

test("auth logger only writes warning and error levels", () => {
	const previousWarn = console.warn;
	const previousError = console.error;
	const warnMessages: string[] = [];
	const errorMessages: string[] = [];

	console.warn = (message?: unknown): void => {
		warnMessages.push(String(message));
	};
	console.error = (message?: unknown): void => {
		errorMessages.push(String(message));
	};

	try {
		authLogger.log?.("info", "token=placeholder-info");
		authLogger.log?.("warn", "token=placeholder-warn");
		authLogger.log?.("error", "token=placeholder-error");
	} finally {
		console.warn = previousWarn;
		console.error = previousError;
	}

	assert.deepEqual(warnMessages, ["[better-auth] token=[redacted]"]);
	assert.deepEqual(errorMessages, ["[better-auth] token=[redacted]"]);
});
