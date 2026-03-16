FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download model files for VAD
RUN python -c "from livekit.plugins import silero; silero.VAD.load()"

# Copy agent code
COPY agent.py .

# Run the agent in production mode
CMD ["python", "agent.py", "start"]
