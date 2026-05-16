import type { IncomingHttpHeaders } from "node:http";
import { UnauthorizedException } from "@nestjs/common";
import { SET_COOKIE_HEADER_NAME } from "./auth.constants.js";
import { type AuthenticatedUser, getAuthenticatedSession } from "./authenticated-user.js";

export interface RequestWithHeaders {
	headers: IncomingHttpHeaders;
}

export interface ResponseWithCookieHeaders {
	append(name: string, value: string | string[]): void;
}

export async function requireAuthenticatedUser(
	request: RequestWithHeaders,
	response: ResponseWithCookieHeaders,
): Promise<AuthenticatedUser> {
	const result = await getAuthenticatedSession(request.headers);
	forwardSessionCookies(result.headers, response);

	if (!result.user) {
		throw new UnauthorizedException("Authentication required");
	}

	return result.user;
}

function getSetCookieHeaders(headers: Headers): string[] {
	const readableHeaders = headers as Headers & { getSetCookie?: () => string[] };
	const cookies = readableHeaders.getSetCookie?.();

	if (cookies?.length) {
		return cookies;
	}

	const cookie = headers.get(SET_COOKIE_HEADER_NAME);
	return cookie ? [cookie] : [];
}

function forwardSessionCookies(headers: Headers, response: ResponseWithCookieHeaders): void {
	const setCookieHeaders = getSetCookieHeaders(headers);

	if (setCookieHeaders.length > 0) {
		// Better Auth owns cookie attributes; API controllers only forward session refresh headers.
		response.append(SET_COOKIE_HEADER_NAME, setCookieHeaders);
	}
}
