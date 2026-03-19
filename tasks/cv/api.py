"""FastAPI server for Computer Vision task."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi import FastAPI
from datetime import datetime
import uvicorn
from dtos import PredictRequest, PredictResponse
from model import predict

app = FastAPI()
startup_time = datetime.now()

PORT = 9050


@app.get("/")
def health():
    return "Endpoint is running!"


@app.get("/api")
def metadata():
    return {"service": "cv-task", "uptime": str(datetime.now() - startup_time)}


@app.post("/predict")
def predict_endpoint(request: PredictRequest) -> PredictResponse:
    return predict(request)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
