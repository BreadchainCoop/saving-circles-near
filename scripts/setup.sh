#!/usr/bin/env bash
# Builds and tests everything from a fresh clone: the contract and test token wasm, the unit
# and sandbox integration tests, and the frontend's static build.
#
#   scripts/setup.sh
#
# Requires Rust with the wasm32-unknown-unknown target, cargo-near, Node 22 and pnpm 11
# (`corepack enable` provides the pnpm version pinned in app/package.json). The integration
# tests download a NEAR sandbox binary, which runs on Linux and Apple Silicon only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

missing=()
command -v cargo >/dev/null || missing+=("Rust (https://rustup.rs)")
cargo near --version >/dev/null 2>&1 || missing+=("cargo-near (https://github.com/near/cargo-near)")
command -v node >/dev/null || missing+=("Node 22")
command -v pnpm >/dev/null || missing+=("pnpm 11 (run: corepack enable)")
if [ ${#missing[@]} -gt 0 ]; then
  printf 'Missing: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "== Contract: build wasm"
cd "$ROOT/contracts"
cargo near build non-reproducible-wasm
cargo near build non-reproducible-wasm --manifest-path mock-ft/Cargo.toml

echo "== Contract: unit and integration tests"
cargo test --workspace

echo "== Frontend: install and build"
cd "$ROOT/app"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build

echo
echo "All built and tested. Start the app against the testnet deployment:"
echo "  cd app && pnpm dev    # http://localhost:3002"
