#!/usr/bin/env bash
# Run desktop tests with an isolated real keyring and display, never basic_text.
set -euo pipefail
SESSION_DIR=$(mktemp -d -t paperweight-keyring-XXXXXX)
cleanup() {
  # Full GNOME desktops can activate per-session FUSE mounts automatically.
  for name in doc gvfs; do
    if mountpoint -q "$SESSION_DIR/run/$name"; then
      fusermount3 -u "$SESSION_DIR/run/$name"
    fi
  done
  rm -rf "$SESSION_DIR"
}
trap cleanup EXIT
mkdir -m 700 "$SESSION_DIR/run" "$SESSION_DIR/data"
export XDG_RUNTIME_DIR="$SESSION_DIR/run"
export XDG_DATA_HOME="$SESSION_DIR/data"
export GIO_USE_VFS=local
dbus-run-session -- xvfb-run -a bash -euc '
  printf "%s" "paperweight-synthetic-session" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
  exec "$@"
' _ "$@"
