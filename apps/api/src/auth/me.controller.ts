import type { IncomingHttpHeaders } from "node:http";
import { Controller, Get, Req, Res, UnauthorizedException } from "@nestjs/common";
import { SET_COOKIE_HEADER_NAME } from "./auth.constants.js";
import { type AuthenticatedUser, getAuthenticatedSession } from "./authenticated-user.js";

interface RequestWithHeaders {
	headers: IncomingHttpHeaders;
}

interface ResponseWithCookieHeaders {
	append(name: string, value: string | string[]): void;
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
		response.append(SET_COOKIE_HEADER_NAME, setCookieHeaders);
	}
}

@Controller("me")
export class MeController {
	@Get()
	async getCurrentUser(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
	): Promise<AuthenticatedUser> {
		const result = await getAuthenticatedSession(request.headers);
		forwardSessionCookies(result.headers, response);

		if (!result.user) {
			throw new UnauthorizedException("Authentication required");
		}

		return result.user;
	}
}
