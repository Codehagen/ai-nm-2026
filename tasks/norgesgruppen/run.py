"""NorgesGruppen Object Detection — Sandbox Inference Script.

Executed as: python run.py --input /data/images --output /output/predictions.json

SANDBOX RULES:
- No `import os`, subprocess, socket, ctypes, builtins
- Use pathlib for all file operations
- GPU (NVIDIA L4) is always available
- ultralytics 8.1.0 is pre-installed
- 300 second timeout
"""

import argparse
import json
from pathlib import Path

import torch
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Directory with test images")
    parser.add_argument("--output", required=True, help="Path for predictions JSON")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_path = Path(args.output)

    # Load model — .pt file must be in same directory as run.py
    model_path = Path(__file__).parent / "best.pt"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = YOLO(str(model_path))

    predictions = []

    # Process each image
    image_files = sorted(
        p for p in input_dir.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )

    for img_path in image_files:
        # Extract image_id from filename: img_00042.jpg → 42
        image_id = int(img_path.stem.split("_")[-1])

        # Run inference — max_det=300 handles dense shelves
        results = model(
            str(img_path),
            device=device,
            verbose=False,
            conf=0.01,      # low threshold, let mAP evaluation handle it
            max_det=300,     # dense shelves can have 200+ products
        )

        for r in results:
            if r.boxes is None or len(r.boxes) == 0:
                continue
            for i in range(len(r.boxes)):
                x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
                # Convert xyxy → COCO [x, y, width, height]
                predictions.append({
                    "image_id": image_id,
                    "category_id": int(r.boxes.cls[i].item()),
                    "bbox": [
                        round(x1, 1),
                        round(y1, 1),
                        round(x2 - x1, 1),
                        round(y2 - y1, 1),
                    ],
                    "score": round(float(r.boxes.conf[i].item()), 4),
                })

    # Write predictions
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(predictions, f)

    print(f"Wrote {len(predictions)} predictions for {len(image_files)} images")


if __name__ == "__main__":
    main()
