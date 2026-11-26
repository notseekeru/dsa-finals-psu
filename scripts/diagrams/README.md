# Report diagrams

The figures in the report. Each is a fixed-coordinate HTML page that renders to a PNG in `docs/images/`.

## Render

```sh
nix shell nixpkgs#chromium
./render.sh
```

`CHROME=/path/to/chrome` overrides detection. The script renders each page at 2x and overwrites the PNG the report points at, so re-render after a source change. Chromium needs network for the webfonts on a cold font cache; without it the fallback font changes line breaks. A re-render can shift antialiasing by a hair even when the source did not change; check before committing a stray PNG diff.

`render.sh` owns the page-to-PNG map and the canvas size. A new figure means a new page and a new `render` line.

## Figure types

- Schema: one card per table, field rows, key badges, a wire per foreign key. `erd.html`.
- Flow: a vertical chain of `.step` cards, `.note` beside the card it constrains. `system-flow.html`.
- Request path: a horizontal chain of `.node` cards, plus a dashed lane per concern that runs around it. `data-connection.html`.

The canvas is the label budget. A wider canvas buys layout room and costs type size, so match the width to the density.

## Structure

Each page is one `#canvas`. Fixed coordinates instead of a layout engine: the arrows are hand-routed, and a reflow would move cards away from their paths.

- `.node`, `.step` or `.card` for boxes, placed by inline `left`, `top`, `width`, `height`
- an SVG `#wires` layer whose `viewBox` matches the canvas, one path per connector, `marker-end="url(#arrow)"` for the ones that carry direction
- `.zone` with a `.zone-label` pill for a lane, `.lane` for a caption, `.note` for a constraint
- z-order: zones behind wires, wires behind cards, captions on top
- a wire that targets a field row depends on that row's `line-height`, so every row sets one explicitly

This repo has no icon set, so a card names its table or file in JetBrains Mono instead of carrying a brand mark.

## Fonts and color

Inter and JetBrains Mono, plus DejaVu fallbacks. Paper is the background, ink the text, muted the secondary lines, accent the wire that carries the flow, amber the wire that points at a detail. The values are CSS variables at the top of each page. They are diagram-local, not site tokens; the site palette owns its own values.

## Before committing

- Look at the whole PNG at report width: no note overlaps a card, no caption collides with a wire.
- Size check: the canvas, the SVG `viewBox` and the render size in `render.sh` agree, with no scaled wrapper.
- Diff check: only the pages and PNGs you meant.
