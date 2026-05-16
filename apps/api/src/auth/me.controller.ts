import { Controller, Get, Req, Res } from "@nestjs/common";
import {
	type RequestWithHeaders,
	type ResponseWithCookieHeaders,
	requireAuthenticatedUser,
} from "./authenticated-request.js";
import type { AuthenticatedUser } from "./authenticated-user.js";

@Controller("me")
export class MeController {
	@Get()
	async getCurrentUser(
		@Req() request: RequestWithHeaders,
		@Res({ passthrough: true }) response: ResponseWithCookieHeaders,
	): Promise<AuthenticatedUser> {
		return requireAuthenticatedUser(request, response);
	}
}
