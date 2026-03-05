from fastapi import FastAPI

from api import api_router

app = FastAPI(title="Hello All Worlds - Python Server")
app.include_router(api_router)





@app.get("/")
def root() -> dict:
    return {"message": "Hello from python_server"}


# Optional local dev entrypoint (uvicorn)
if __name__ == "__main__":
    import uvicorn

    from config import get_settings

    settings = get_settings()
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)