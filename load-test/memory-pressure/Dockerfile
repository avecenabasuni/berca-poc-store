FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --yes --no-install-recommends stress-ng=0.17.06-1build1 \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/berca-memory-pressure

RUN chmod 0555 /usr/local/bin/berca-memory-pressure

ENTRYPOINT ["/usr/local/bin/berca-memory-pressure"]
