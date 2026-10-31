# Design

The visual specification of the ring gauge. The module implements it;
deviations are listed at the end.

## Goals

- One module, several instances; each instance shows exactly one reading.
- Recognizable at a glance: what is measured (icon and name), the value,
  and the assessment (color, marker position and status word).
- Readable on light and dark, busy background photos.
- Subtle: no animation except a calm marker movement when the value
  changes.

## Structure

```
.ring-gauge                 210 × 210 px, position: relative, border-radius: 50 %
├── scrim (background of the container)
├── SVG: scale segments (one arc per band)
├── SVG: marker (dot on the arc)
└── center (absolute, centered, column)
    ├── head: icon 16 px + name
    ├── value
    ├── unit
    └── status word
```

## Scale geometry

| Property | Value |
| --- | --- |
| Container | 210 × 210 px |
| Center | (105, 105) |
| Radius | 78 |
| Stroke width | 9 |
| Sweep | 270° (three-quarter circle), open at the bottom |
| Start angle | 135° (bottom left), clockwise to 45° (bottom right) |
| Gap between segments | 5 px of arc length |
| Line caps | `butt` |

Segments are `<circle>` elements drawn with `stroke-dasharray` and
`stroke-dashoffset`, rotated to the start angle with
`rotate(135 105 105)`.

Per band `i`, with `f_i` its share of the whole range and `cum_i` the sum
of the shares before it:

- Total arc length `L = 2π · 78 · 0.75 ≈ 367.6`
- `stroke-dasharray = (f_i · L − 5) 1000`
- `stroke-dashoffset = −(cum_i · L + 2.5)`
- The active band (the one holding the value) has `stroke-opacity: 1`,
  all others `0.3`.

Marker:

- Relative value `p = clamp((value − min) / (max − min), 0, 1)`
- Angle `a = 135° + p · 270°`
- Position `x = 105 + 78 · cos(a)`, `y = 105 + 78 · sin(a)`
- Circle r = 8, fill `#ffffff`, stroke `rgba(0, 0, 0, .7)` 3 px. The dark
  outline keeps the marker visible on white parts of the photo.
- On a value change the marker moves along the arc in about 600 ms
  `ease-out`: interpolate the angle, not x and y.

## Readability over the photo

The container gets a soft dark halo without an edge:

```css
background: radial-gradient(circle,
  rgba(8, 10, 14, .72) 0 62%,
  rgba(8, 10, 14, .45) 74%,
  rgba(8, 10, 14, 0) 100%);
```

No `backdrop-filter`: blurring a large background photo costs noticeable
performance on weak hardware (Raspberry Pi), and the halo gives enough
contrast.

## Typography and colors

| Element | Size | Weight | Color | Other |
| --- | --- | --- | --- | --- |
| Name | 12 px | 400 | `rgba(255,255,255,.8)` | upper case, `letter-spacing: .12em` |
| Icon | 16 × 16 px | – | as name | stroke 1.8, `currentColor` |
| Value | 46 px | 300 | `#f5f5f5` | `font-variant-numeric: tabular-nums`, `line-height: 1` |
| Unit | 13 px | 400 | `rgba(255,255,255,.7)` | |
| Status | 14 px | 600 | status color | `letter-spacing: .04em`, 4 px space above |

Rows in the center are 4 px apart.

Status colors differ in lightness too, not only in hue:

| Level | Color |
| --- | --- |
| `good` | `#4ade80` |
| `warn` | `#fbbf24` |
| `bad` | `#f87171` |

## Icons

24 × 24 view box, outline only, stroke width 1.8, round caps.

- CO₂ (molecule): `<circle cx="12" cy="12" r="3.2"/>`,
  `<circle cx="4" cy="12" r="2"/>`, `<circle cx="20" cy="12" r="2"/>`,
  `<path d="M6 12h2.8M15.2 12H18"/>`
- Humidity (drop):
  `<path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z"/>`

Further icons follow the same style.

## Bands

Bands cover `min` to `max` without gaps; there may be any number of them
(humidity has limits on both sides). Values outside the range keep the
marker at the end of the arc, still show the correct number, and take the
assessment of the outermost band.

CO₂, range 400–2500 ppm (German Environment Agency: above 1000 ppm
conspicuous, above 2000 ppm unacceptable):

| Up to | Level | Status |
| --- | --- | --- |
| 1000 | good | Gut |
| 2000 | warn | Lüften |
| 2500 | bad | Jetzt lüften |

Humidity, range 20–80 %:

| Up to | Level | Status |
| --- | --- | --- |
| 30 | warn | Zu trocken |
| 60 | good | Optimal |
| 70 | warn | Zu feucht |
| 80 | bad | Viel zu feucht |

## Special states

- **No value yet:** value "—", all segments at opacity 0.3, no marker, no
  status word.
- **Stale value** (older than a configurable time, default 10 min): value
  and marker at opacity 0.5, status word "veraltet" (stale) in
  `rgba(255,255,255,.7)`.

## Implementation notes

- Build the DOM in `getDom()`, SVG via `document.createElementNS`.
- Only re-render when value or level change. For the marker movement,
  update the existing marker instead of replacing the DOM.
- Styles in the module's own CSS file, sizes and colors as CSS custom
  properties, so that all instances can be adjusted together.
- Several instances side by side: 48 px apart.

## Deviations in the module

- **Font:** the specification names Roboto Condensed. The gauge sets no
  font and takes the mirror's font instead, so that it matches a theme
  such as WallberryTheme (Rubik). Without a theme, MagicMirror's own font
  is Roboto Condensed.
- **Status weight 600:** neither Roboto Condensed (300, 400, 700) nor
  WallberryTheme's Rubik (300–400) ships 600; the browser substitutes or
  synthesizes it.
- **Halo color:** the scrim color is the custom property
  `--ring-gauge-scrim`, so that a theme can tint it.
- **Active band while stale:** not specified; the band of the last value
  stays active.
