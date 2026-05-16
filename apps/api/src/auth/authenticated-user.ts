import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

export interface AuthenticatedUser {
	userId: string;
	email: string;
}

export async function getAuthenticatedUser(
	headers: IncomingHttpHeaders,
): Promise<AuthenticatedUser | null> {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(headers),
	});

	if (!session?.user.id || !session.user.email) {
		return null;
	}

	return {
		userId: session.user.id,
		email: session.user.email,
	};
}
