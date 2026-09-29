# Sandbox for Node.js projects: every run executes the repository's commands in a container
# started from this image (see packages/sandbox). Build it with `pnpm sandbox:build`.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git procps ripgrep \
  && rm -rf /var/lib/apt/lists/*

# pnpm and yarn through corepack. The shims live in /usr/local/bin, so any user can run them.
RUN corepack enable

# The image ships `node` (UID 1000); the sandbox gets a user of its own with the same IDs, so a
# host user with UID 1000 owns what the container writes. The worker usually runs the container
# with the host user's UID/GID, which may have no /etc/passwd entry here: HOME is world-writable
# (sticky), so npm, pnpm and corepack caches work for any UID.
RUN userdel --remove node \
  && groupadd --gid 1000 sandbox \
  && useradd --uid 1000 --gid 1000 --home-dir /home/sandbox --create-home --shell /bin/bash sandbox \
  && chmod 1777 /home/sandbox \
  && mkdir /workspace \
  && chown sandbox:sandbox /workspace

ENV HOME=/home/sandbox \
  CI=true \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  NPM_CONFIG_UPDATE_NOTIFIER=false

USER sandbox
WORKDIR /workspace

# Keeps the container alive for the whole run; commands arrive through `docker exec`.
CMD ["sleep", "infinity"]
