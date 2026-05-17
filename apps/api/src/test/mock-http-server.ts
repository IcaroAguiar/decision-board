import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export async function createMockHttpServer(
	handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	assert.notEqual(address, null);
	assert.notEqual(typeof address, "string");

	return {
		baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			}),
	};
}

export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
	response.writeHead(status, {
		"content-type": "application/json",
	});
	response.end(JSON.stringify(payload));
}
