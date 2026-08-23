#!/usr/bin/env bash
# deploy.sh — push this checkout's committed work to kodely.me.
#
#   ./deploy.sh            staging -> verify -> prod -> verify
#   ./deploy.sh --staging  stop after staging
#
# Transport note: the VM cannot currently reach GitHub over SSH (see the board
# card "VM cannot reach GitHub over SSH"). Its own /home/kodely/deploy.sh runs
# `git fetch origin main && git reset --hard origin/main`, and when that fetch
# fails it resets to a STALE remote-tracking ref and reports a healthy deploy
# of the WRONG commit — it did that twice on 2026-08-21.
#
# So this script does not rely on the VM pulling. It still pushes to GitHub
# (that works from here, and keeps origin authoritative), then ships the actual
# commits over the existing SSH path as a git bundle and builds in place. When
# the VM's GitHub access is restored, the bundle step can be dropped.
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

git fetch -q origin main || die "cannot reach GitHub from here"
if [ -n "$(git log --oneline origin/main..HEAD)" ]; then
  say "Pushing to origin/main"
  git log --oneline origin/main..HEAD | sed 's/^/  /'
  git push -q origin main
fi
NEW=$(git rev-parse --short HEAD)
echo "  main = $NEW"

ROLLBACK=$(vm 'cd /opt/kodely && git rev-parse --short HEAD')
say "Rollback point (current prod): $ROLLBACK"

# --------------------------------------------------------------- transport
# Bundle only what the VM is missing, using prod's current HEAD as the base.
say "Bundling commits for the VM"
# Base on the OLDER of the two environments, not just prod: staging is
# routinely behind, and a bundle cut from prod's HEAD would be missing the
# commits staging still needs. merge-base gives the common ancestor.
PROD_HEAD=$(vm 'cd /opt/kodely && git rev-parse HEAD')
STAGING_HEAD=$(vm 'cd /opt/kodely-staging && git rev-parse HEAD')
for c in "$PROD_HEAD" "$STAGING_HEAD"; do
  git cat-file -e "${c}^{commit}" 2>/dev/null || die "the VM is on commit ${c:0:7}, which this checkout does not have — fetch/rebase first"
done
BASE=$(git merge-base "$PROD_HEAD" "$STAGING_HEAD")
echo "  prod=${PROD_HEAD:0:7}  staging=${STAGING_HEAD:0:7}  base=${BASE:0:7}"

if [ "$BASE" = "$(git rev-parse HEAD)" ]; then
  echo "  both environments already at $NEW — nothing to transport"
  rm -f /tmp/kodely-deploy.bundle
  vm "rm -f /tmp/kodely-deploy.bundle" || true
else
  # Must be `..main`, not `..HEAD`: a bundle cut against HEAD is written with a
  # ref literally named "HEAD", and the VM's `git fetch <bundle> main` then
  # fails with "couldn't find remote ref main".
  git bundle create /tmp/kodely-deploy.bundle "$BASE..main" >/dev/null 2>&1
  echo "  $(git rev-list --count "$BASE..HEAD") commit(s), $(du -h /tmp/kodely-deploy.bundle | cut -f1)"
  # Raw bytes over stdin through both hops, NOT base64 embedded as a command
  # argument. The base64 version deadlocked in practice on a real bundle
  # (confirmed live: the exact nested `echo '$B64' | ssh ...` form hung
  # indefinitely on a 1.4M bundle, no error, no progress). Embedding megabytes
  # of text as a single argv element is the failure mode — it has to be fully
  # buffered before anything moves and has no OS-level backpressure. `-J`
  # (ProxyJump) was tried first and is not an option: the jump host refuses
  # port-forwarding ("administratively prohibited"). Piping through the
  # command's own stdin/stdout needs no forwarding permission — verified live
  # at this exact bundle size (1.5M, <1s, sha256-identical) before landing.
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" \
    "ssh -o BatchMode=yes $VM 'cat > /tmp/kodely-deploy.bundle'" \
    < /tmp/kodely-deploy.bundle \
    || die "could not transfer the bundle to the VM"
  vm "cd /opt/kodely && git bundle verify /tmp/kodely-deploy.bundle >/dev/null 2>&1" \
    || die "bundle failed verification on the VM"
  echo "  transferred and verified"
fi

deploy_env() {
  local env="$1" dir="$2" svc="$3" url="$4"

  say "Deploying $env"
  # Apply the bundle, then build. Every step is chained with && under `set -e`
  # so a failure here fails the deploy instead of leaving stale code running.
  vm "set -e
      cd $dir
      if [ -f /tmp/kodely-deploy.bundle ]; then
        git fetch -q /tmp/kodely-deploy.bundle main
        git update-ref refs/remotes/origin/main FETCH_HEAD
        git reset -q --hard FETCH_HEAD
      fi
      npm ci --no-audit --no-fund >/dev/null 2>&1
      npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1
      npm run build >/dev/null 2>&1
      sudo systemctl restart $svc" || die "$env deploy failed"
  sleep 5

  say "Verifying $env"
  local head build code
  head=$(vm "cd $dir && git rev-parse --short HEAD")
  build=$(vm "stat -c %y $dir/.next/BUILD_ID | cut -d. -f1")
  echo "  HEAD=$head  BUILD_ID=$build  service=$(vm "systemctl is-active $svc")"
  # The check that catches a stale deploy: HEAD must equal what we just shipped.
  [ "$head" = "$NEW" ] || die "$env is on $head, expected $NEW — deploy did not take"
  for path in /api/health / /pricing /blog /contact; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 25 "$url$path")
    printf '  %-12s %s\n' "$path" "$code"
    [ "$code" = "200" ] || die "$env $path returned $code"
  done
}

deploy_env staging /opt/kodely-staging kodely-staging https://staging.kodely.me

if [ "$STAGING_ONLY" = "--staging" ]; then
  say "Stopped after staging. Prod untouched."
  exit 0
fi

deploy_env prod /opt/kodely kodely https://kodely.me

say "Shipped"
echo "  main:     $NEW"
echo "  live:     https://kodely.me"
echo "  rollback: $ROLLBACK"
