import type { IncomingMessage, ServerResponse } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";

const CLIENT_IP_HEADER = "x-forwarded-for";
const TRUST_PROXY_HOPS_ENV = "TRUST_PROXY_HOPS";

type NextFunction = () => void;
type RequestWithClientIp = IncomingMessage & {
	ip?: string;
};

interface ExpressProxyHost {
	set(setting: "trust proxy", value: number | false): void;
	use(
		handler: (request: RequestWithClientIp, response: ServerResponse, next: NextFunction) => void,
	): void;
}

export function getTrustedProxyHops(): number {
	const rawValue = process.env[TRUST_PROXY_HOPS_ENV];

	if (!rawValue) {
		return 0;
	}

	const value = Number.parseInt(rawValue, 10);

	if (!Number.isInteger(value) || value < 0 || String(value) !== rawValue) {
		throw new Error(`${TRUST_PROXY_HOPS_ENV} must be a non-negative integer`);
	}

	return value;
}

export function normalizeClientIpForAuth(app: NestExpressApplication): void {
	const expressApp = app.getHttpAdapter().getInstance() as ExpressProxyHost;
	const trustedProxyHops = getTrustedProxyHops();

	expressApp.set("trust proxy", trustedProxyHops > 0 ? trustedProxyHops : false);
	expressApp.use((request, _response, next) => {
		const clientIp = request.ip ?? request.socket.remoteAddress;

		if (clientIp) {
			request.headers[CLIENT_IP_HEADER] = clientIp;
		} else {
			delete request.headers[CLIENT_IP_HEADER];
		}

		next();
	});
}
