import type { Logger } from "better-auth";

const AUTH_LOG_LEVEL_ERROR = "error";

function safeLog(message: string): void {
	console.error(`[better-auth] ${message}`);
}

export const authLogger: Logger = {
	level: AUTH_LOG_LEVEL_ERROR,
	log(level, message) {
		if (level === AUTH_LOG_LEVEL_ERROR) {
			safeLog(message);
		}
	},
};
