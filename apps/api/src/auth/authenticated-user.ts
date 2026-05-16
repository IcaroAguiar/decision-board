import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

export interface AuthenticatedUser {
	userId: string;
	email: string;
}

export interface AuthenticatedSessionResult {
	user: AuthenticatedUser | null;
	headers: Headers;
}

export async function getAuthenticatedSession(
	headers: IncomingHttpHeaders,
): Promise<AuthenticatedSessionResult> {
	const result = await auth.api.getSession({
		headers: fromNodeHeaders(headers),
		returnHeaders: true,
	});
	const session = result.response;

	if (!session?.user.id || !session.user.email) {
		return {
			user: null,
			headers: result.headers,
		};
	}

	return {
		user: {
			userId: session.user.id,
			email: session.user.email,
		},
		headers: result.headers,
	};
}
