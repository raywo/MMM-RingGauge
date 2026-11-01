# Styling

Sizes and colors are CSS custom properties on `.MMM-RingGauge`; override
them in `config/custom.css`:

| Property | Default |
| --- | --- |
| `--ring-gauge-size` | `10.5rem` – width of the gauge; text and ring grow with it |
| `--ring-gauge-scrim` | `rgb(8, 10, 14)` – tint of the glass |
| `--ring-gauge-rim` | `rgba(255, 255, 255, 0.55)` – light on the glass's rim and its sheen |
| `--ring-gauge-blur` | `0.6em` – blur behind the glass; takes effect only with frosted glass (below) |
| `--ring-gauge-good`, `--ring-gauge-warn`, `--ring-gauge-bad`, `--ring-gauge-cold` | `#4ade80`, `#fbbf24`, `#f87171`, `#38bdf8` |
| `--ring-gauge-text`, `--ring-gauge-label`, `--ring-gauge-unit` | text colors |
| `--ring-gauge-unavailable` | `var(--ring-gauge-warn)` – color of the "link broken" symbol |
| `--ring-gauge-gap` | `2.4rem`, on the [panel](#panel) `0.2em` – space between the rings of a group |
| `--ring-gauge-max-width` | `100%` – limit of a group's width; keep a set limit narrower than the region |

Size and gap are in `rem`, so the gauge grows with MagicMirror's
`--font-size` like the other modules do.

## Frosted glass

The glass is clear by default: it tints the photo behind it but does
not blur it. To frost it, switch the blur on per instance:

```js
{
  module: "MMM-RingGauge",
  position: "top_left",
  classes: "ring-gauge-blur",
  config: { /* … */ }
},
```

or for all instances in `config/custom.css`:

```css
.MMM-RingGauge .ring-gauge {
  backdrop-filter: blur(var(--ring-gauge-blur)) saturate(1.4);
}
```

The browser redoes the blur on every frame in which the photo or the
gauge changes: while the photo fades to the next one, and while the
marker moves to a new value. Start MagicMirror² with the environment
variable `ELECTRON_ENABLE_GPU=1` so that the GPU does it: MagicMirror²
switches the GPU off by default, and on the CPU these moments may
stutter, on a Raspberry Pi as well. Where the variable goes depends on
how MagicMirror² runs:

- In a shell, in front of the start command:

  ```sh
  cd ~/MagicMirror
  ELECTRON_ENABLE_GPU=1 node --run start
  ```

- With pm2, the usual setup on a Raspberry Pi, with the name that
  `pm2 list` shows for MagicMirror²; `pm2 save` keeps the variable for
  the start after a reboot:

  ```sh
  ELECTRON_ENABLE_GPU=1 pm2 restart <name> --update-env
  pm2 save
  ```

- With systemd, in the `[Service]` section of the unit:
  `Environment=ELECTRON_ENABLE_GPU=1`.

## Panel

A group of rings can stand on one pane of glass instead of a disc each:

![A CO₂ and a humidity gauge as a group on one pane of
glass](../images/panel.png)

```js
{
  module: "MMM-RingGauge",
  position: "middle_center",
  classes: "ring-gauge-panel",
  config: { rings: [/* … */] }
},
```

The panel takes `--ring-gauge-scrim` and `--ring-gauge-rim` like the
discs. On the panel, the rings stand closer: `--ring-gauge-gap` is
`0.2em`, so that the rings stand as far apart as from the panel's edge.
`layout.gap` or `--ring-gauge-gap` in `config/custom.css` replaces it.
With `classes: "ring-gauge-panel ring-gauge-blur"`, the panel is
frosted instead of each disc.

## WallberryTheme

With WallberryTheme, the glass can take the hue of the photo. Without a
photo, `--wb-tint-dark` is invalid and the fallback applies:

```css
.module.MMM-RingGauge {
  --ring-gauge-scrim: var(--wb-tint-dark, rgb(8, 10, 14));
}
```
