#!/bin/sh
# Renders the three states of the whole complex, the crypt frame, then composes the deliverables.
cd "$(dirname "$0")"
for st in ${STATES:-complet milieu debut}; do STATE=$st OUT=$st node run.mjs complex.mjs || exit 1; done
STATE=complet HERO=crypt WIN=1610,90,960,540 VIG=0.25 OUT=crypte node run.mjs complex.mjs || exit 1
node plan.mjs && node compose.mjs
