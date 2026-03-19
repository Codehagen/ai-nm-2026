"""Baseline/test script for NLP task."""

import httpx

BASE_URL = "http://localhost:9052"


def test_health():
    r = httpx.get(f"{BASE_URL}/")
    print(f"Health: {r.status_code} - {r.text}")


def test_predict():
    r = httpx.post(f"{BASE_URL}/predict", json={"text": "Hello world"})
    print(f"Predict: {r.status_code} - {r.json()}")


if __name__ == "__main__":
    test_health()
    test_predict()
