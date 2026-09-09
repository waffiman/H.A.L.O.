FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

# Headed Connect one-shots on VPS use xvfb-run (avoid apt-get on every test run).
RUN apt-get update && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

# Copy package and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy all source files
COPY . .

# Setting the command to run the script
CMD ["node", "index.js"]
