// ha3d: a light with several fixtures on one switch ("points": [[x, z], ...] or [[x, z, rot], ...],
// e.g. "cans" or "sconce") is one item in the editor: dragging or nudging it moves its "pos"
// and every point together. Points are plan coordinates, so the light keeps its shape.

const fix = (v) => Math.round(v * 1000) / 1000;

export const pointsOf = (item) => (Array.isArray(item?.points) ? item.points : []);

/** A copy of where an item stands now, to move it from. */
export function grab(item) {
  return { pos: [...item.pos], points: pointsOf(item).map((p) => [...p]) };
}

/** Puts `item` at `from` moved by (dx, dz): its pos and, if it has them, all its points. */
export function moveBy(item, from, dx, dz) {
  item.pos = [fix(from.pos[0] + dx), fix(from.pos[1] + dz)];
  if (from.points.length) item.points = from.points.map(([x, z, ...rest]) => [fix(x + dx), fix(z + dz), ...rest]);
}

/** The points relative to the item's pos, for drawing them inside its (translated) plan symbol. */
export function relativePoints(item) {
  return pointsOf(item).map(([x, z]) => [fix(x - item.pos[0]), fix(z - item.pos[1])]);
}
