"""CV API endpoint tests."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from api import app

client = TestClient(app)


def test_health():
    response = client.get("/")
    assert response.status_code == 200


def test_metadata():
    response = client.get("/api")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "cv-task"


def test_predict():
    response = client.post("/predict", json={"image": ""})
    assert response.status_code == 200
    assert "prediction" in response.json()
