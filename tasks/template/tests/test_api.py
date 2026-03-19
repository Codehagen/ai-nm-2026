"""API endpoint tests."""

import pytest
from fastapi.testclient import TestClient
from api import app

client = TestClient(app)


def test_health():
    response = client.get("/")
    assert response.status_code == 200
    assert "running" in response.json().lower()


def test_metadata():
    response = client.get("/api")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "uptime" in data


def test_predict():
    response = client.post("/predict", json={})
    assert response.status_code == 200
