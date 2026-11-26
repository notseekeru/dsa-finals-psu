#!/bin/sh
set -eu
cd "$(dirname "$0")"

CHROME=${CHROME:-}
if [ -z "$CHROME" ]; then
    for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
        if command -v "$candidate" >/dev/null 2>&1; then
            CHROME=$(command -v "$candidate")
            break
        fi
    done
fi
if [ -z "$CHROME" ]; then
    printf '%s\n' "No Chromium found. Set CHROME=/path/to/chrome." >&2
    exit 1
fi

mkdir -p ../../docs/images

render() {
    html=$1
    size=$2
    name=$3
    out="$(pwd)/../../docs/images/$name"
    tmp="$out.tmp.png"
    rm -f "$tmp"
    if ! "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
        --window-size="$size" --force-device-scale-factor=2 \
        --virtual-time-budget=8000 --run-all-compositor-stages-before-draw \
        --screenshot="$tmp" "file://$(pwd)/$html" >/dev/null 2>&1 || [ ! -f "$tmp" ]; then
        rm -f "$tmp"
        printf '%s\n' "render failed: $html" >&2
        exit 1
    fi
    mv "$tmp" "$out"
    printf '%s\n' "wrote docs/images/$name"
}

render erd.html 1400,1000 erd.png
render system-flow.html 1100,1300 system-flow.png
render data-connection.html 1200,820 data-connection.png
