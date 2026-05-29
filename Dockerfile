FROM oven/bun:1-alpine

WORKDIR /app

COPY email-extractor/package.json email-extractor/bun.lock ./
RUN bun install --frozen-lockfile

COPY email-extractor/ .

EXPOSE 8787

CMD ["bun", "run", "index.ts"]
