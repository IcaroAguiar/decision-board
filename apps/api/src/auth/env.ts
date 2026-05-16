import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const LOCAL_ENV_FILE = ".env";
const REPO_ROOT_ENV_FILE_URL = new URL("../../../../.env", import.meta.url);

function loadLocalEnvFileIfPresent(): void {
	if (existsSync(LOCAL_ENV_FILE)) {
		loadEnvFile(LOCAL_ENV_FILE);
		return;
	}

	if (existsSync(REPO_ROOT_ENV_FILE_URL)) {
		loadEnvFile(REPO_ROOT_ENV_FILE_URL);
	}
}

loadLocalEnvFileIfPresent();

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
