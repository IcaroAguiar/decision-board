import type { IncomingHttpHeaders } from "node:http";
import { Controller, Get, Req, UnauthorizedException } from "@nestjs/common";
import { type AuthenticatedUser, getAuthenticatedUser } from "./authenticated-user.js";

interface RequestWithHeaders {
	headers: IncomingHttpHeaders;
}

@Controller("me")
export class MeController {
	@Get()
	async getCurrentUser(@Req() request: RequestWithHeaders): Promise<AuthenticatedUser> {
		const user = await getAuthenticatedUser(request.headers);

		if (!user) {
			throw new UnauthorizedException("Authentication required");
		}

		return user;
	}
}
