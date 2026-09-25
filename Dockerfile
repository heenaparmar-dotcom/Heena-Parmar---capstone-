# Dockerfile-based deploy so the build environment and the runtime
# environment are guaranteed to be the same image — needed because
# Railway's default Railpack builder installs apt packages during build
# but runs the app in a separate, slimmer runtime image, so Playwright's
# Chromium shared-library dependencies (libglib-2.0.so.0 etc.) never made
# it to the container that actually launches the browser.
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxext6 libx11-6 libxcb1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

RUN npx playwright install chromium

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/server.js"]
