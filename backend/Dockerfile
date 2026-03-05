FROM python:3.12-slim

# Install system dependencies needed by Playwright/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy dependency manifest first for layer caching
COPY pyproject.toml ./

# Install Python dependencies
RUN uv pip install --system -e .

# Install Playwright with Chromium and its system dependencies
RUN playwright install chromium --with-deps

# Copy application source
COPY . .

# Ensure the data directory exists
RUN mkdir -p /app/data/resumes

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
