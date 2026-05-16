import type { Logger } from "better-auth";

export const authLogger: Logger = {
	level: "error",
	log(level, message) {
		if (level === "error") {
			console.error(`[better-auth] ${message}`);
		}
	},
};
