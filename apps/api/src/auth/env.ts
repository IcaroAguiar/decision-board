export function getRequiredEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is required`);
	}

	return value;
}

export function getTrustedOrigins(): string[] {
	const origins = new Set<string>();
	const webOrigin = process.env.WEB_ORIGIN;
	const authUrl = process.env.BETTER_AUTH_URL;

	if (webOrigin) {
		origins.add(webOrigin);
	}

	if (authUrl) {
		origins.add(new URL(authUrl).origin);
	}

	return [...origins];
}
