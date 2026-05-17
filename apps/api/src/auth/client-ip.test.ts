import assert from "node:assert/strict";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getTrustedProxyHops, normalizeClientIpForAuth } from "./client-ip.js";

const TRUST_PROXY_HOPS_ENV = "TRUST_PROXY_HOPS";
const CLIENT_IP_HEADER = "x-forwarded-for";
const TRUSTED_REQUEST_IP = "203.0.113.10";
const STALE_FORWARDED_IP = "203.0.113.99";
const SOCKET_REMOTE_ADDRESS = "198.51.100.7";
const STALE_REMOTE_ADDRESS_HEADER = "198.51.100.8";
const PRIVATE_PROXY_ADDRESS = "10.0.0.10";

type NextFunction = () => void;
type ClientIpHandler = (
	request: IncomingMessage & { ip?: string },
	response: ServerResponse,
	next: NextFunction,
) => void;

interface FakeExpressHost {
	handlers: ClientIpHandler[];
	trustProxy: number | false | undefined;
	set(setting: "trust proxy", value: number | false): void;
	use(handler: ClientIpHandler): void;
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

function createFakeApp(): { app: NestExpressApplication; expressHost: FakeExpressHost } {
	const expressHost: FakeExpressHost = {
		handlers: [],
		trustProxy: undefined,
		set(_setting, value) {
			this.trustProxy = value;
		},
		use(handler) {
			this.handlers.push(handler);
		},
	};
	const app = {
		getHttpAdapter() {
			return {
				getInstance() {
					return expressHost;
				},
			};
		},
	} as NestExpressApplication;

	return { app, expressHost };
}

function createRequest(options: {
	headers?: IncomingHttpHeaders;
	ip?: string;
	remoteAddress?: string;
}): IncomingMessage & { ip?: string } {
	return {
		headers: options.headers ?? {},
		ip: options.ip,
		socket: {
			remoteAddress: options.remoteAddress,
		},
	} as IncomingMessage & { ip?: string };
}

test("reads trusted proxy hops from an explicit non-negative integer", () => {
	const previousTrustProxyHops = process.env[TRUST_PROXY_HOPS_ENV];

	try {
		delete process.env[TRUST_PROXY_HOPS_ENV];
		assert.equal(getTrustedProxyHops(), 0);

		process.env[TRUST_PROXY_HOPS_ENV] = "0";
		assert.equal(getTrustedProxyHops(), 0);

		process.env[TRUST_PROXY_HOPS_ENV] = "2";
		assert.equal(getTrustedProxyHops(), 2);
	} finally {
		restoreEnv(TRUST_PROXY_HOPS_ENV, previousTrustProxyHops);
	}
});

test("rejects invalid trusted proxy hop values", () => {
	const previousTrustProxyHops = process.env[TRUST_PROXY_HOPS_ENV];

	try {
		for (const value of ["-1", "1.5", "01", "2 "]) {
			process.env[TRUST_PROXY_HOPS_ENV] = value;
			assert.throws(() => getTrustedProxyHops(), /TRUST_PROXY_HOPS must be a non-negative integer/);
		}
	} finally {
		restoreEnv(TRUST_PROXY_HOPS_ENV, previousTrustProxyHops);
	}
});

test("normalizes client IP header from trusted Express request IP", () => {
	const previousTrustProxyHops = process.env[TRUST_PROXY_HOPS_ENV];
	process.env[TRUST_PROXY_HOPS_ENV] = "1";

	try {
		const { app, expressHost } = createFakeApp();

		normalizeClientIpForAuth(app);

		assert.equal(expressHost.trustProxy, 1);
		assert.equal(expressHost.handlers.length, 1);

		let nextCalls = 0;
		const request = createRequest({
			headers: { [CLIENT_IP_HEADER]: STALE_FORWARDED_IP },
			ip: TRUSTED_REQUEST_IP,
			remoteAddress: PRIVATE_PROXY_ADDRESS,
		});

		expressHost.handlers[0]?.(request, {} as ServerResponse, () => {
			nextCalls += 1;
		});

		assert.equal(request.headers[CLIENT_IP_HEADER], TRUSTED_REQUEST_IP);
		assert.equal(nextCalls, 1);
	} finally {
		restoreEnv(TRUST_PROXY_HOPS_ENV, previousTrustProxyHops);
	}
});

test("falls back to socket remote address and clears missing client IP", () => {
	const previousTrustProxyHops = process.env[TRUST_PROXY_HOPS_ENV];
	delete process.env[TRUST_PROXY_HOPS_ENV];

	try {
		const { app, expressHost } = createFakeApp();

		normalizeClientIpForAuth(app);

		assert.equal(expressHost.trustProxy, false);
		assert.equal(expressHost.handlers.length, 1);

		const remoteAddressRequest = createRequest({
			headers: {},
			remoteAddress: SOCKET_REMOTE_ADDRESS,
		});
		expressHost.handlers[0]?.(remoteAddressRequest, {} as ServerResponse, () => {});
		assert.equal(remoteAddressRequest.headers[CLIENT_IP_HEADER], SOCKET_REMOTE_ADDRESS);

		const missingAddressRequest = createRequest({
			headers: { [CLIENT_IP_HEADER]: STALE_REMOTE_ADDRESS_HEADER },
		});
		expressHost.handlers[0]?.(missingAddressRequest, {} as ServerResponse, () => {});
		assert.equal(missingAddressRequest.headers[CLIENT_IP_HEADER], undefined);
	} finally {
		restoreEnv(TRUST_PROXY_HOPS_ENV, previousTrustProxyHops);
	}
});
