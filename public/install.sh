#!/bin/sh
# Install saasrow, the saasrow.com CLI (npm: @profullstack/saasrow).
#
#   curl -fsSL https://saasrow.com/install.sh | sh
#
# Uses bun if present, otherwise npm (Node >= 20.11). When the global npm
# prefix is not writable it installs into ~/.local instead of asking for sudo.
# Re-running it upgrades to the latest version.
set -eu

PKG="@profullstack/saasrow"
BIN="saasrow"

say() { printf '%s\n' "$*"; }
die() { printf 'saasrow install: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

say "Installing saasrow (the saasrow.com software directory CLI)..."

if have bun; then
  # bun add -g writes into the nearest package.json above its global dir when
  # that dir has none (e.g. ~/package.json): give it its own first.
  BUN_GLOBAL="${BUN_INSTALL:-$HOME/.bun}/install/global"
  mkdir -p "$BUN_GLOBAL"
  [ -f "$BUN_GLOBAL/package.json" ] || printf '{}\n' > "$BUN_GLOBAL/package.json"
  bun add -g "$PKG@latest"
  BIN_DIR="${BUN_INSTALL:-$HOME/.bun}/bin"
elif have npm && have node; then
  ok=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>20||(a===20&&b>=11)?1:0)' 2>/dev/null || echo 0)
  [ "$ok" = 1 ] || die "Node >= 20.11 required (found $(node -v)). Upgrade Node or install bun: https://bun.sh"
  prefix=$(npm config get prefix)
  modules="$prefix/lib/node_modules"
  [ -d "$modules" ] || modules="$prefix/lib"
  if [ -w "$modules" ] && [ -w "$prefix/bin" ]; then
    npm install -g "$PKG@latest"
    BIN_DIR="$prefix/bin"
  else
    BIN_DIR="$HOME/.local/bin"
    say "npm prefix $prefix is not writable; installing into $HOME/.local"
    npm install -g --prefix "$HOME/.local" "$PKG@latest"
  fi
else
  die "needs bun (https://bun.sh) or Node >= 20.11 with npm (https://nodejs.org)"
fi

say ""
if have "$BIN"; then
  say "saasrow $("$BIN" --version 2>/dev/null || true) installed."
else
  say "saasrow installed to $BIN_DIR, which is not on your PATH. Add it:"
  say "  export PATH=\"$BIN_DIR:\$PATH\""
fi
say ""
say "Next:"
say "  saasrow login            # emailed one-time code; stores an API key locally"
say "  saasrow listings list    # your free listings"
say "  saasrow --help"
