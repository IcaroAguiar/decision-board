import type { IncomingMessage, ServerResponse } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { AUTH_ROUTE_PATTERN } from "./auth.constants.js";
import { auth } from "./auth.js";

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

interface ExpressRouteHost {
	all(path: string, handler: NodeHandler): void;
}

export function mountAuthHandler(app: NestExpressApplication): void {
	const expressApp = app.getHttpAdapter().getInstance() as ExpressRouteHost;

	expressApp.all(AUTH_ROUTE_PATTERN, toNodeHandler(auth));
}
