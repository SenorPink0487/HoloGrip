FROM rust:1.96-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/target/release/hologrip-proxy /usr/local/bin/hologrip-proxy
COPY migrations ./migrations
ENV PROXY_BIND=0.0.0.0:8787 \
    METRICS_BIND=0.0.0.0:9898
EXPOSE 8787 9898
ENTRYPOINT ["/usr/local/bin/hologrip-proxy"]
