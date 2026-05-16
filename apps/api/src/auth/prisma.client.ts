import { PrismaClient } from "@prisma/client";

const DEVELOPMENT_ENVIRONMENT = "development";
const PRODUCTION_ENVIRONMENT = "production";
const PRISMA_LOG_LEVEL_WARN = "warn";
const PRISMA_LOG_LEVEL_ERROR = "error";

declare global {
	var decisionBoardPrisma: PrismaClient | undefined;
}

export const prisma =
	globalThis.decisionBoardPrisma ??
	new PrismaClient({
		log:
			process.env.NODE_ENV === DEVELOPMENT_ENVIRONMENT
				? [PRISMA_LOG_LEVEL_WARN, PRISMA_LOG_LEVEL_ERROR]
				: [PRISMA_LOG_LEVEL_ERROR],
	});

if (process.env.NODE_ENV !== PRODUCTION_ENVIRONMENT) {
	globalThis.decisionBoardPrisma = prisma;
}
