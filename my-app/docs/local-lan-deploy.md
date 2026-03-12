# Local LAN Docker Deployment

This app can be deployed on a Linux host on your local network with Docker Compose.

## Scope

- Frontend only
- No Convex CLI or local Convex process on the LAN host
- Backend remains the Convex dev deployment at `https://harmless-heron-66.convex.cloud`
- Plain HTTP on port `3000`
- Runtime is the generated TanStack Start server bundle behind a small Node wrapper

## Files

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.env`

## First Deploy

```bash
cd /path/to/tcg_ims4/my-app
docker compose --env-file docker-compose.env up -d --build
```

## Verify

```bash
docker compose --env-file docker-compose.env ps
docker compose --env-file docker-compose.env logs -f frontend
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

Open the app from another machine on the LAN at `http://<server-lan-ip>:3000`.

## Updates

After pulling code changes:

```bash
cd /path/to/tcg_ims4/my-app
docker compose --env-file docker-compose.env up -d --build
```

To restart without rebuilding:

```bash
docker compose --env-file docker-compose.env restart frontend
```

## Notes

- `docker-compose.env` provides the Convex URLs at build time.
- `.env.local` is intentionally excluded from the Docker build context so the container build only uses the Compose-provided values.
- `npm start` runs the generated server bundle on `127.0.0.1:3000`.
- The container uses `npm run start:lan`, which binds the same server to `0.0.0.0:3000`.
