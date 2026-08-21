#!/usr/bin/env bash
# deploy.sh — push this tree's committed work to kodely.me.
#
#   ./deploy.sh            staging -> verify -> prod -> verify
#   ./deploy.sh --staging  stop after staging
#
# This is the PROD checkout, so there is no cherry-picking and no personal
# divergence to guard against (unlike ship.sh in the personal instance).
# Commit, run this, done.
set -euo pipefail

HOST=root@51.79.162.96
VM=kodely@10.20.0.30
STAGING_ONLY="${1:-}"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }
vm()  { ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "ssh -o BatchMode=yes $VM \"$1\""; }

say "Pre-flight"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main"
[ -z "$(git status --porcelain)" ] || die "working tree dirty — commit first"

# A dependency change means the VM must reinstall; deploy.sh on the VM runs
# npm ci, so this is handled — but warn, since it makes the deploy slower and
# a bad lockfile is the known way to break it.
git fetch -q origin main
if ! git diff --quiet origin/main -- package-lock.json; then
  echo "  note: package-lock.json differs from origin/main (dependency change)"
fi

if [ -n "$(git log --oneline origin/main..HEAD)" ]; then
  say "Pushing to origin/main"
  git log --oneline origin/main..HEAD | sed 's/^/  /'
  git push -q origin main
else
  echo "  nothing to push; deploying current origin/main"
fi
NEW=$(git rev-parse --short origin/main)
echo "  main = $NEW"

ROLLBACK=$(vm 'cd /opt/kodely && git rev-parse --short HEAD')
say "Rollback point (current prod): $ROLLBACK"

verify() {
  local env="$1" url="$2" dir="$3"
  local head behind build code
  head=$(vm "cd $dir && git rev-parse --short HEAD")
  behind=$(vm "cd $dir && git rev-list --count HEAD..origin/main")
  build=$(vm "stat -c %y $dir/.next/BUILD_ID | cut -d. -f1")
  echo "  HEAD=$head  behind_main=$behind  BUILD_ID=$build"
  [ "$head" = "$NEW" ] || die "$env HEAD ($head) != main ($NEW)"
  [ "$behind" = "0" ]  || die "$env is $behind commits behind main"
  for path in /api/health / /pricing /blog /contact; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$url$path")
    printf '  %-12s %s\n' "$path" "$code"
    [ "$code" = "200" ] || die "$env $path returned $code"
  done
}

say "Deploying staging"; vm "/home/kodely/deploy.sh staging 2>&1 | tail -2"
say "Verifying staging"; verify staging https://staging.kodely.me /opt/kodely-staging

if [ "$STAGING_ONLY" = "--staging" ]; then
  say "Stopped after staging. Prod untouched."
  exit 0
fi

say "Deploying prod"; vm "/home/kodely/deploy.sh prod 2>&1 | tail -2"
say "Verifying prod"; verify prod https://kodely.me /opt/kodely

say "Shipped"
echo "  main:     $NEW"
echo "  live:     https://kodely.me"
echo "  rollback: $ROLLBACK"
