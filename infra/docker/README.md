# Local Infrastructure

The root `docker-compose.yml` starts the local PostgreSQL service used by Prisma and the API.

```bash
docker compose up -d
docker compose ps
```

The default local connection string is documented in `.env.example`.
