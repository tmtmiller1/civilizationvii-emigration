#!/usr/bin/env bash
# release.sh: produce a clean, debug-disabled zip ready for Steam Workshop upload.
#
# Usage:  ./release.sh
# Output: dist/emigration-vX.Y.Z.zip  (X.Y.Z read from emigration.modinfo <Version>)
#
# What this does:
#   1. Mirrors the mod source into dist/emigration/ (excluding dev cruft + the
#      dev probe).
#   2. Sed-replaces `const DBG = true` -> `const DBG = false` in every JS file so
#      the verbose traces don't fire in shipped builds. Source stays
#      development-friendly; only the dist copy is muted.
#   3. Always ships readable JS (no minification; transparent source is a core
#      property of the mod, so there is no minify path).
#   4. Verifies the modinfo has Version + Authors set to non-default values.
#   5. Zips the result with `emigration/` as the zip root (Steam Workshop needs
#      the modinfo at zip root, not inside a wrapper folder).
#   6. Audits the zip against an allow-list so stray files can't silently ship.
#
# Run from the mod source directory.

set -euo pipefail

cd "$(dirname "$0")"

DIST_DIR="dist"
if [ -f "emigration.modinfo" ]; then
    SRC_DIR="."
elif [ -f "emigration/emigration.modinfo" ]; then
    SRC_DIR="emigration"
else
    echo "error: no emigration.modinfo in $(pwd) or $(pwd)/emigration/"
    exit 1
fi

# Pull <Version> from the modinfo (first match wins).
VERSION="$(grep -oE '<Version>[^<]+</Version>' "$SRC_DIR/emigration.modinfo" \
    | head -1 | sed -E 's|</?Version>||g')"
[ -n "$VERSION" ] || { echo "error: could not parse <Version> from modinfo"; exit 1; }

AUTHORS="$(grep -oE '<Authors>[^<]+</Authors>' "$SRC_DIR/emigration.modinfo" \
    | head -1 | sed -E 's|</?Authors>||g')"
case "$AUTHORS" in
    ""|"Your Name"|"TODO")
        echo "error: <Authors> in modinfo is '$AUTHORS'; provide a release author name first."
        exit 1
        ;;
esac

# ── Steam Workshop published file id ──────────────────────────────────────
# The publishedfileid is what makes steamcmd UPDATE the existing Workshop item
# instead of creating a duplicate. It must survive the `rm -rf dist` below, so we
# persist it OUTSIDE dist/ in steam_workshop_id.txt (committed to the repo).
WORKSHOP_ID_FILE="$SRC_DIR/steam_workshop_id.txt"
PUBLISHED_FILE_ID="${WORKSHOP_PUBLISHED_FILE_ID:-}"
SAVED_PUBLISHED_FILE_ID=""
if [ -f "$WORKSHOP_ID_FILE" ]; then
    SAVED_PUBLISHED_FILE_ID="$(tr -dc '0-9' < "$WORKSHOP_ID_FILE")"
fi
if [ -n "$PUBLISHED_FILE_ID" ] && [ -n "$SAVED_PUBLISHED_FILE_ID" ] \
    && [ "$PUBLISHED_FILE_ID" != "$SAVED_PUBLISHED_FILE_ID" ]; then
    echo "error: WORKSHOP_PUBLISHED_FILE_ID ($PUBLISHED_FILE_ID) conflicts with"
    echo "       steam_workshop_id.txt ($SAVED_PUBLISHED_FILE_ID). Refusing to override."
    exit 1
fi
if [ -z "$PUBLISHED_FILE_ID" ] && [ -n "$SAVED_PUBLISHED_FILE_ID" ]; then
    PUBLISHED_FILE_ID="$SAVED_PUBLISHED_FILE_ID"
fi

ZIP_NAME="emigration-v${VERSION}.zip"
TARGET_DIR="$DIST_DIR/emigration"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

echo "==> Cleaning $DIST_DIR/"
rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR"

echo "==> Mirroring $SRC_DIR/ → $TARGET_DIR/ (excluding dev cruft + dev probe)"
rsync -a --exclude='.git' --exclude='.gitignore' --exclude='.DS_Store' --exclude='dist' \
    --exclude='release.sh' --exclude='*.bak' --exclude='node_modules' \
    --exclude='tsconfig.json' --exclude='jsconfig.json' --exclude='types' --exclude='docs' \
    --exclude='eslint.config.js' --exclude='package.json' --exclude='package-lock.json' \
    --exclude='*.d.ts' --exclude='tests' --exclude='steam_workshop_id.txt' \
    --exclude='CONTRIBUTING.md' --exclude='scripts' --exclude='i18n' --exclude='README.pdf' \
    --exclude='migration-probe.modinfo' --exclude='ui/migration-probe.js' \
    --exclude='coverage' --exclude='reports' --exclude='.stryker-tmp' \
    --exclude='.c8rc.json' --exclude='stryker.config.json' \
    "$SRC_DIR"/ "$TARGET_DIR"/

echo "==> Disabling debug logging in dist JS files"
# BSD/macOS sed needs the empty -i argument.
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 sed -i '' -E \
    -e 's/^const DBG = true;/const DBG = false;/'

echo "==> Shipping dist JS readable (no minification)"

echo "==> Syntax-checking dist JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 -n1 node -c

echo "==> Verifying modinfo at zip root"
[ -f "$TARGET_DIR/emigration.modinfo" ] \
    || { echo "error: $TARGET_DIR/emigration.modinfo missing"; exit 1; }

echo "==> Zipping $ZIP_PATH"
( cd "$DIST_DIR" && zip -qr "$ZIP_NAME" emigration )

# Allow-list audit: fail the build on any shipped file that isn't expected, so a
# loose rsync exclude can't silently ship docs/, tests/, the probe, *.d.ts, etc.
echo "==> Verifying zip contents against allow-list"
ALLOW='^emigration/(emigration\.modinfo|README\.md|LICENSE|CHANGELOG\.md)$'
ALLOW="$ALLOW"'|^emigration/ui/.+\.(js|html|css)$'
ALLOW="$ALLOW"'|^emigration/text/[a-z_]+/ModText\.xml$'
ALLOW="$ALLOW"'|^emigration/data/.+\.(xml|sql)$'
UNEXPECTED="$(unzip -Z1 "$ZIP_PATH" | grep -vE '/$' | grep -vE "$ALLOW" || true)"
if [ -n "$UNEXPECTED" ]; then
    echo "error: zip contains entries not on the allow-list:"
    echo "$UNEXPECTED" | sed 's/^/    /'
    echo "  → tighten the rsync --exclude list, or update ALLOW in release.sh if intended."
    exit 1
fi
echo "    OK: every shipped entry matches the allow-list."

echo "==> Zip contents:"
unzip -l "$ZIP_PATH" | head -40 || true

SIZE="$(du -h "$ZIP_PATH" | cut -f1)"

# ── Workshop preview card ─────────────────────────────────────────────────
# Render the branded preview (docs/workshop-preview.svg: dark frame + migration
# logo + wordmark) to a 1024x1024 PNG for the Steam Workshop thumbnail. It lives
# OUTSIDE the shipped zip (a Workshop preview is uploaded separately via the .vdf),
# so it never trips the allow-list audit above.
PREVIEW_SRC="$SRC_DIR/docs/workshop-preview.svg"
PREVIEW_OUT="$DIST_DIR/preview.png"
ABS_PREVIEW=""
if [ -f "$PREVIEW_SRC" ]; then
    if command -v rsvg-convert >/dev/null 2>&1; then
        rsvg-convert -w 1024 -h 1024 "$PREVIEW_SRC" -o "$PREVIEW_OUT"
        ABS_PREVIEW="$(cd "$DIST_DIR" && pwd)/preview.png"
        echo "==> Workshop preview rendered: $PREVIEW_OUT (from $(basename "$PREVIEW_SRC"))"
    else
        echo "==> rsvg-convert not found; preview.png NOT generated (brew install librsvg)."
    fi
fi

# ── Steam Workshop manifest (.vdf) ────────────────────────────────────────
VDF_PATH="$DIST_DIR/workshop_item.vdf"
ABS_CONTENT="$(cd "$TARGET_DIR" && pwd)"

# Change note. For the FIRST publish (no publishedfileid yet) the CHANGELOG is just
# internal dev history, not a public "what changed", so the note is simply
# "Initial release." For an UPDATE to an existing item, pull the current version's
# section out of CHANGELOG.md and render its bullet lines as a Steam BBCode list.
CHANGELOG_FILE="$SRC_DIR/CHANGELOG.md"
CHANGENOTE="Initial release."
if [ -n "$PUBLISHED_FILE_ID" ] && [ -f "$CHANGELOG_FILE" ]; then
    CHANGENOTE="v${VERSION} release."
    BULLETS="$(awk -v ver="$VERSION" '
        $0 ~ ("^## \\[" ver "\\]") { grab = 1; next }
        grab && /^## / { exit }
        grab { print }
    ' "$CHANGELOG_FILE" \
        | sed -nE 's/^[[:space:]]*[-*][[:space:]]+(.*)$/[*]\1/p' \
        | sed -E 's/\*\*//g; s/`//g' \
        | tr '\n' ' ')"
    if [ -n "$BULLETS" ]; then
        CHANGENOTE="$(printf '[list]%s[/list]' "$BULLETS" \
            | sed -E 's/\\/\\\\/g; s/"/\\"/g')"
    fi
fi

{
    echo '"workshopitem"'
    echo '{'
    echo '    "appid"          "1295660"'
    [ -n "$PUBLISHED_FILE_ID" ] && echo "    \"publishedfileid\" \"$PUBLISHED_FILE_ID\""
    echo "    \"contentfolder\"  \"$ABS_CONTENT\""
    [ -n "$ABS_PREVIEW" ] && echo "    \"previewfile\"    \"$ABS_PREVIEW\""
    echo '    "visibility"     "0"'
    echo '    "title"          "Emigration"'
    # NOTE: "description" is intentionally omitted so steamcmd preserves the
    # description currently set on the Workshop page instead of overwriting it.
    echo "    \"changenote\"     \"${CHANGENOTE}\""
    echo '}'
} > "$VDF_PATH"

if [ -n "$PUBLISHED_FILE_ID" ]; then
    printf '%s\n' "$PUBLISHED_FILE_ID" > "$WORKSHOP_ID_FILE"
fi

echo "==> Workshop manifest written: $VDF_PATH"
echo ""
echo "✓ Release built:  $ZIP_PATH  ($SIZE)"
echo "  Version:        $VERSION"
echo "  Authors:        $AUTHORS"
if [ -n "$PUBLISHED_FILE_ID" ]; then
    echo "  UPDATE mode:    publishedfileid $PUBLISHED_FILE_ID (existing item)"
else
    echo "  NEW-ITEM mode:  no publishedfileid yet (first upload creates one;"
    echo "                  then: echo <publishedfileid> > steam_workshop_id.txt)"
fi
echo ""
echo "── Upload (from Mac) ──"
echo "  ~/steamcmd/steamcmd.sh +login <yourSteamLogin> \\"
echo "      +workshop_build_item $(cd "$DIST_DIR" && pwd)/workshop_item.vdf +quit"
