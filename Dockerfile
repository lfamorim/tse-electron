FROM node:18-slim

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    xvfb && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -d /home/electron -s /bin/bash electron \
    && chown -R electron:electron /home/electron

# Set up working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Set ownership of the application files
RUN chown -R electron:electron /usr/src/app

# Set environment variables
ENV DISPLAY=:99
ENV ELECTRON_DISABLE_SANDBOX=1
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Switch to non-root user
USER electron

# Start script
COPY docker-entrypoint.sh /usr/local/bin/

ENTRYPOINT ["docker-entrypoint.sh"]

CMD ["npm", "run", "server"]
