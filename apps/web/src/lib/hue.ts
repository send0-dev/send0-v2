/** A stable hue (0–359) for a string, so the same person or inbox always gets the same colour. */
export function hueOf(value: string): number {
  let h = 0;
  for (const ch of value.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
