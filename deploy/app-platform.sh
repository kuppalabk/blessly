#!/usr/bin/env bash
# Create or update the Blessly app on DigitalOcean App Platform.
# Requires: doctl, python3, openssl, and DIGITALOCEAN_ACCESS_TOKEN (or `doctl auth init`).
# Usage: bash deploy/app-platform.sh [branch]
# Secrets are written to .do/secrets.env (mode 600, gitignored) and sent as SECRET env vars.
# They are never printed and never committed.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v doctl >/dev/null 2>&1; then
  echo "doctl is not installed. See https://docs.digitalocean.com/reference/doctl/how-to/install/" >&2
  exit 1
fi
if [[ -z "${DIGITALOCEAN_ACCESS_TOKEN:-}" ]] && ! doctl account get >/dev/null 2>&1; then
  echo "Set DIGITALOCEAN_ACCESS_TOKEN to a DigitalOcean personal access token with App Platform write access." >&2
  exit 1
fi

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"
secrets_file=".do/secrets.env"
mkdir -p .do

if [[ ! -f "$secrets_file" ]]; then
  umask 077
  {
    echo "CRON_SECRET=$(openssl rand -hex 32)"
    echo "ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')"
    echo "MEDIA_SIGNING_SECRET=$(openssl rand -hex 32)"
  } > "$secrets_file"
  echo "Wrote ${secrets_file}. Copy ENCRYPTION_KEY into a password manager. It is not in git."
fi
# shellcheck disable=SC1090
set -a
source "$secrets_file"
set +a

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
python3 - "$branch" "$tmp" <<'PY'
import os, pathlib, sys
branch, dest = sys.argv[1], sys.argv[2]
text = pathlib.Path(".do/app.yaml").read_text()
if "branch: main" not in text:
    raise SystemExit(".do/app.yaml has no 'branch: main' to retarget")
text = text.replace("branch: main", "branch: " + branch)

def q(name):
    value = os.environ[name]
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'

secret_lines = []
for key in ("CRON_SECRET", "ENCRYPTION_KEY", "MEDIA_SIGNING_SECRET"):
    secret_lines.append(
        "  - key: %s\n    scope: RUN_TIME\n    type: SECRET\n    value: %s" % (key, q(key))
    )
block = "\n" + "\n".join(secret_lines) + "\n"
needle = "\ningress:\n"
if needle not in text:
    raise SystemExit(".do/app.yaml is missing the ingress section")
text = text.replace(needle, block + needle, 1)
pathlib.Path(dest).write_text(text)
PY

create_or_update() {
  local spec="$1"
  echo "Submitting app blessly from branch ${branch}"
  # --upsert creates the app or updates the existing app with this name.
  doctl apps create --spec "$spec" --upsert --update-sources --wait --wait-timeout 60m --format ID,DefaultIngress
}

log="$(mktemp)"
set +e
create_or_update "$tmp" >"$log" 2>&1
status=$?
set -e
cat "$log"
if [[ "$status" -eq 0 ]]; then
  rm -f "$log"
  exit 0
fi
if ! grep -qiE 'github|repository' "$log"; then
  rm -f "$log"
  exit "$status"
fi
rm -f "$log"
echo "GitHub source was rejected. Retrying with the public clone URL. Deploy-on-push needs the GitHub connection in DigitalOcean." >&2
git_spec="$(mktemp)"
python3 - "$tmp" "$git_spec" <<'PY'
import pathlib, re, sys
src, dest = sys.argv[1], sys.argv[2]
text = pathlib.Path(src).read_text()
text = re.sub(
    r"github:\n      repo: kuppalabk/blessly\n      branch: (\S+)\n      deploy_on_push: true",
    r"git:\n      repo_clone_url: https://github.com/kuppalabk/blessly.git\n      branch: \1",
    text,
)
pathlib.Path(dest).write_text(text)
PY
create_or_update "$git_spec"
rm -f "$git_spec"
