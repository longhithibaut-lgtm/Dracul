#!/bin/sh
# Publishes the built game to the gh-pages branch, served at https://longhithibaut-lgtm.github.io/Dracul/
# (GitHub: Settings > Pages > Deploy from a branch > gh-pages, / (root)). Usage: sh scripts/pages.sh
set -e
npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Game build from $(git -C .. rev-parse --short HEAD)"
git push -q -f "$(git -C .. remote get-url origin)" gh-pages
rm -rf .git
echo "Published: https://longhithibaut-lgtm.github.io/Dracul/"
