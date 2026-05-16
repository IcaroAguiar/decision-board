import type { Logger } from "better-auth";

const AUTH_LOG_LEVEL_ERROR = "error";
const AUTH_LOG_LEVEL_WARN = "warn";
const REDACTED_AUTH_URL_PAYLOAD = "[redacted-url-payload]";
const REDACTED_AUTH_VALUE = "[redacted]";
const ABSOLUTE_URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const RELATIVE_URL_WITH_PAYLOAD_PATTERN = /(^|[\s([{])((?:\/|\.\.?\/)[^\s"'<>]*[?#][^\s"'<>]*)/g;
const SENSITIVE_ASSIGNMENT_PATTERN =
	/\b(token|code|state|callbackURL|redirectURL|email|password|secret|session(?:_token)?|verification|otp)=([^&\s"'<>]+)/gi;
const TRAILING_URL_PUNCTUATION_PATTERN = /[)\].,;!?]+$/;

function splitTrailingPunctuation(value: string): [string, string] {
	const match = TRAILING_URL_PUNCTUATION_PATTERN.exec(value);

	if (!match?.[0]) {
		return [value, ""];
	}

	return [value.slice(0, -match[0].length), match[0]];
}

function redactUrlPayload(value: string): string {
	const [urlText, trailingPunctuation] = splitTrailingPunctuation(value);

	try {
		const url = new URL(urlText);
		const hasPayload = url.search.length > 0 || url.hash.length > 0;
		const sanitizedUrl = `${url.origin}${url.pathname}${
			hasPayload ? `?${REDACTED_AUTH_URL_PAYLOAD}` : ""
		}`;

		return `${sanitizedUrl}${trailingPunctuation}`;
	} catch {
		const queryIndex = urlText.indexOf("?");
		const hashIndex = urlText.indexOf("#");
		const firstPayloadIndex = [queryIndex, hashIndex]
			.filter((index) => index >= 0)
			.sort((left, right) => left - right)[0];

		if (firstPayloadIndex === undefined) {
			return `${urlText}${trailingPunctuation}`;
		}

		return `${urlText.slice(0, firstPayloadIndex)}?${REDACTED_AUTH_URL_PAYLOAD}${trailingPunctuation}`;
	}
}

function coerceAuthLogMessage(message: unknown): string {
	if (message instanceof Error) {
		return message.message || message.name;
	}

	if (typeof message === "string") {
		return message;
	}

	if (message === null || message === undefined) {
		return "";
	}

	if (typeof message === "object") {
		return "[non-string auth log message]";
	}

	return String(message);
}

export function sanitizeAuthLogMessage(message: unknown): string {
	return coerceAuthLogMessage(message)
		.replace(ABSOLUTE_URL_PATTERN, redactUrlPayload)
		.replace(
			RELATIVE_URL_WITH_PAYLOAD_PATTERN,
			(_match, prefix: string, url: string) => `${prefix}${redactUrlPayload(url)}`,
		)
		.replace(
			SENSITIVE_ASSIGNMENT_PATTERN,
			(_match, key: string) => `${key}=${REDACTED_AUTH_VALUE}`,
		);
}

function safeLog(
	level: typeof AUTH_LOG_LEVEL_ERROR | typeof AUTH_LOG_LEVEL_WARN,
	message: unknown,
): void {
	const formattedMessage = `[better-auth] ${sanitizeAuthLogMessage(message)}`;

	if (level === AUTH_LOG_LEVEL_ERROR) {
		console.error(formattedMessage);
		return;
	}

	console.warn(formattedMessage);
}

export const authLogger: Logger = {
	level: AUTH_LOG_LEVEL_WARN,
	log(level, message) {
		if (level === AUTH_LOG_LEVEL_ERROR || level === AUTH_LOG_LEVEL_WARN) {
			safeLog(level, message);
		}
	},
};
