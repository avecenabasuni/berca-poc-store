FROM ubuntu:24.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --yes --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY memory-holder.c /src/memory-holder.c

RUN gcc \
    -O2 \
    -Wall \
    -Wextra \
    -Werror \
    -std=c17 \
    -o /usr/local/bin/berca-memory-holder \
    /src/memory-holder.c

FROM ubuntu:24.04

COPY --from=builder /usr/local/bin/berca-memory-holder /usr/local/bin/berca-memory-holder
COPY entrypoint.sh /usr/local/bin/berca-memory-pressure

RUN chmod 0555 /usr/local/bin/berca-memory-holder /usr/local/bin/berca-memory-pressure

ENTRYPOINT ["/usr/local/bin/berca-memory-pressure"]
