# Hermes preview runtime

Doable calls the OpenAI-compatible Responses API exposed by the Hermes gateway. Hermes Agent v0.18.2 uses port `8642` by default and requires an API server key even on loopback.

## Start Hermes

Choose a local secret of at least eight characters. Use the same value for `API_SERVER_KEY` here and `HERMES_API_KEY` in `server/.env`; do not commit either value.

```bash
export API_SERVER_ENABLED=true
export API_SERVER_HOST=127.0.0.1
export API_SERVER_PORT=8642
export API_SERVER_KEY='replace-with-a-local-secret'
hermes gateway run
```

In another terminal, confirm the gateway is reachable:

```bash
curl http://127.0.0.1:8642/health
```

## Start Doable

```bash
cd server
cp .env.example .env
# Edit .env so HERMES_API_KEY exactly matches API_SERVER_KEY.
uv run uvicorn app.main:app --reload --port 8787 --env-file .env
```

Check the sanitized integration status at `http://127.0.0.1:8787/v1/hermes/status`. The endpoint reports availability without returning the key or gateway configuration.
