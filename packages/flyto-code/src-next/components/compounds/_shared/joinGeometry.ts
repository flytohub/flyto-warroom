/**
 * Shared SVG geometry for node-to-node mapping canvases.
 */

export function bezierPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const dx = Math.abs(x2 - x1) * 0.5
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
