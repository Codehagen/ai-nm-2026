FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS base

RUN apt-get update && apt-get install -y python3.11 python3-pip python3.11-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared/ /app/shared/
COPY requirements.txt /app/requirements-base.txt
RUN pip install --no-cache-dir -r /app/requirements-base.txt

COPY tasks/cv/requirements.txt /app/requirements-task.txt
RUN pip install --no-cache-dir -r /app/requirements-task.txt

COPY tasks/cv/ /app/

EXPOSE 9050

ENV TASK_MODE=inference

CMD if [ "$TASK_MODE" = "train" ]; then python3 train.py; else python3 api.py; fi
