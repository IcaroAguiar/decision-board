import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
	AUTH_BASE_PATH,
	DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS,
	DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
} from "./auth.constants.js";
import { authLogger } from "./auth.logger.js";
import { getRequiredEnv, getTrustedOrigins } from "./env.js";
import { prisma } from "./prisma.client.js";

export const auth = betterAuth({
	appName: "Decision Board",
	basePath: AUTH_BASE_PATH,
	baseURL: getRequiredEnv("BETTER_AUTH_URL"),
	secret: getRequiredEnv("BETTER_AUTH_SECRET"),
	trustedOrigins: getTrustedOrigins(),
	logger: authLogger,
	database: prismaAdapter(prisma, {
		provider: "postgresql",
		transaction: true,
	}),
	advanced: {
		database: {
			generateId: "uuid",
		},
		useSecureCookies: process.env.NODE_ENV === "production",
	},
	emailAndPassword: {
		enabled: true,
	},
	rateLimit: {
		enabled: true,
		storage: "database",
		window: DEFAULT_AUTH_RATE_LIMIT_WINDOW_SECONDS,
		max: DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS,
	},
	user: {
		modelName: "user",
	},
	session: {
		modelName: "session",
	},
	account: {
		modelName: "account",
	},
	verification: {
		modelName: "verification",
	},
});

export type AuthSession = typeof auth.$Infer.Session;
