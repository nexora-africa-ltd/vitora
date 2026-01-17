#!/bin/bash
# =============================================================================
# Startup script for WHO ICD-11 API on Render
# =============================================================================
# This script:
# 1. Starts the WHO ICD-11 API on port 80 (its default)
# 2. Uses socat to forward Render's $PORT to port 80
# =============================================================================

set -e

echo "Starting WHO ICD-11 API..."
echo "Render PORT: ${PORT:-10000}"

# Start the original ICD-11 API entrypoint in the background
# The WHO image uses dotnet as its entrypoint
/usr/bin/dotnet /app/WHOFIC.ICD.Api.dll &
ICD_PID=$!

# Wait for ICD-11 API to be ready
echo "Waiting for ICD-11 API to start on port 80..."
for i in {1..60}; do
  if curl -sf http://localhost:80/icd/entity > /dev/null 2>&1; then
    echo "ICD-11 API is ready!"
    break
  fi
  echo "Waiting... ($i/60)"
  sleep 2
done

# Forward Render's PORT to the ICD-11 API's port 80
echo "Starting port forwarding: ${PORT:-10000} -> 80"
socat TCP-LISTEN:${PORT:-10000},fork,reuseaddr TCP:localhost:80 &
SOCAT_PID=$!

# Handle shutdown
trap "kill $ICD_PID $SOCAT_PID 2>/dev/null" EXIT

# Wait for either process to exit
wait -n $ICD_PID $SOCAT_PID
