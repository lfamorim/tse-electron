#!/bin/bash

# Start Xvfb
Xvfb :99 -screen 0 1024x768x16 &

# Wait for Xvfb to be ready
sleep 1

# Execute the command passed to docker run
exec "$@"
