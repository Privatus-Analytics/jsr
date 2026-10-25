#!/bin/sh
# Runs format, lint, tests, framework checks and the publish dry run in pinned
# Deno and Bun images, then the same tests under Bun. Usage: ./run-docker.sh
set -e
DENO_IMAGE=denoland/deno:alpine-2.9.8
BUN_IMAGE=oven/bun:1.4.4-alpine

docker run --rm -v "$PWD":/app -w /app -e DENO_DIR=/tmp/deno "$DENO_IMAGE" sh -c 'set -e
  deno fmt --check
  deno lint
  deno check src/mod.ts src/middleware.ts example/main.ts
  deno test --allow-env tests/
  deno test --allow-env --allow-net --allow-read integration/
  deno publish --dry-run --allow-dirty --config jsr.json
'

docker run --rm -v "$PWD":/app:ro -w /app "$BUN_IMAGE" sh -c 'set -e
  bun --version
  bun test tests/
'
