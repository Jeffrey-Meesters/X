/**
 * One source of truth for the app mark, rendered at every size the manifest,
 * iOS and the browser tab need.
 *
 * `scale` is the only difference between the two icon purposes. A maskable
 * icon may be cropped to a circle by the launcher, so its mark has to sit
 * inside the safe zone - a centred circle of 80% diameter - while the plain
 * `any` icon can use the full canvas.
 */

export const SURFACE = '#0b0d12'
export const MARK = '#4cc157'

/**
 * A dumbbell, drawn side-on: one fat plate at each end of a thick bar.
 *
 * Shape was chosen by rendering candidates at 48px and looking, not by
 * drawing at 512 and hoping. A more literal dumbbell with two plates per side
 * collapses into a striped sliver at home-screen size; the gaps between plates
 * fall below a pixel and the whole mark reads as a smear. One plate per side
 * survives the shrink and still says "dumbbell" rather than "barbell", because
 * the plates are tall against a short bar.
 */
export function iconSvg({ size = 512, scale = 1, background = SURFACE } = {}) {
  const c = size / 2
  // Geometry authored against a 512 canvas, then scaled about the centre.
  const u = (size / 512) * scale

  const bar = { half: 150 * u, thick: 48 * u }
  const plate = { half: 168 * u, width: 76 * u, height: 200 * u }

  const rect = (x, y, w, h, r) =>
    `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${r.toFixed(2)}" />`

  // The bar runs *into* the plates rather than stopping short of them: ending
  // it in the gap reads as three separate bricks, not one object.
  const plateAt = (cx) =>
    rect(cx - plate.width / 2, c - plate.height / 2, plate.width, plate.height, plate.width * 0.26)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="15-Minute Full Body">
  <rect width="${size}" height="${size}" fill="${background}" />
  <g fill="${MARK}">
    ${rect(c - bar.half, c - bar.thick / 2, bar.half * 2, bar.thick, bar.thick / 2)}
    ${plateAt(c - plate.half)}
    ${plateAt(c + plate.half)}
  </g>
</svg>
`
}
