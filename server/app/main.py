from fastapi import FastAPI

app = FastAPI(title="Doable Server")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}