import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const defaultPort = 3001;

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	const port = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);

	await app.listen(port);
}

await bootstrap();
