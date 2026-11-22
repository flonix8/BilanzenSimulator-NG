#!/usr/bin/env bash
# Assembles the static site into _site/ (no build step needed, only a syntax check).
set -euo pipefail

for f in js/*.js; do
  node --check "$f"
done

rm -rf _site
mkdir -p _site
cp -r index.html css js _site/
touch _site/.nojekyll
