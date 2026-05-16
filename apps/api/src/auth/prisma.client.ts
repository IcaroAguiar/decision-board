import { PrismaClient } from "@prisma/client";

declare global {
	var decisionBoardPrisma: PrismaClient | undefined;
}

export const prisma =
	globalThis.decisionBoardPrisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalThis.decisionBoardPrisma = prisma;
}
