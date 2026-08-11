import { jsonContentTypeHeader } from "./monthly-contribution.js";

export async function apiRequest<T>(
	apiBase: string,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);

	if (init.body && !headers.has(jsonContentTypeHeader)) {
		headers.set(jsonContentTypeHeader, "application/json");
	}

	const response = await fetch(`${apiBase}${path}`, {
		...init,
		credentials: "include",
		headers,
	});

	if (!response.ok) {
		const body = await readResponseText(response);
		throw new Error(body || `Request failed with status ${response.status}`);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	const text = await response.text();
	if (!text) {
		return undefined as T;
	}

	return JSON.parse(text) as T;
}

export async function apiRequestAllowUnauthorized<T>(
	apiBase: string,
	path: string,
): Promise<T | null> {
	const response = await fetch(`${apiBase}${path}`, {
		credentials: "include",
	});

	if (response.status === 401) {
		return null;
	}

	if (!response.ok) {
		const body = await readResponseText(response);
		throw new Error(body || `Request failed with status ${response.status}`);
	}

	return response.json() as Promise<T>;
}

async function readResponseText(response: Response): Promise<string> {
	try {
		const payload = await response.json();
		if (payload && typeof payload === "object" && "message" in payload) {
			const message = (payload as { message: unknown }).message;
			if (Array.isArray(message)) {
				return message.map(String).join("; ");
			}
			return String(message);
		}
		return JSON.stringify(payload);
	} catch {
		return response.statusText;
	}
}

export function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}
