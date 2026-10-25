# The conformance example app (Deno and Hono). Build it with the package
# folder as the context:
#   docker build -f example/Dockerfile .
FROM denoland/deno:alpine-2.9.8
WORKDIR /pkg
# The package from this repo's own source (example/main.ts imports ../src),
# not from JSR.
COPY deno.json deno.lock ./
COPY src/ src/
COPY example/ example/
RUN deno cache example/main.ts
USER deno
ENV PORT=8080
EXPOSE 8080
CMD ["run", "--allow-net", "--allow-env", "--cached-only", "example/main.ts"]
