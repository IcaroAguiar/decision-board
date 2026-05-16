import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { mountAuthHandler } from "./auth/auth-http.js";
import { normalizeClientIpForAuth } from "./auth/client-ip.js";
import { getTrustedOrigins } from "./auth/env.js";

const defaultPort = 3001;

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bodyParser: false,
	});
	const port = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);

	app.enableCors({
		credentials: true,
		origin: getTrustedOrigins(),
	});
	normalizeClientIpForAuth(app);
	mountAuthHandler(app);
	app.useBodyParser("json");
	app.useBodyParser("urlencoded", { extended: true });

	await app.listen(port);
}

await bootstrap();
