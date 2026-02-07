#!/usr/bin/env sh
# Use a project-local temp dir to avoid EACCES on system /var/folders
DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DIR/.tmp"
export TMPDIR="$DIR/.tmp"
exec node "$DIR/node_modules/.bin/craco" start
