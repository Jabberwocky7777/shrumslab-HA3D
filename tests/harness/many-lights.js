// A large made-up plan for the light-budget test: 10 rooms, 5 linked lights in each (50), and
// Home Assistant states with the first `on` of them switched on. Every entity is demo_.
const TYPES = ['ceiling', 'cans', 'table', 'floor', 'strip'];

export function manyLightsPlan() {
  const rooms = [];
  const lights = [];
  for (let i = 0; i < 10; i++) {
    const x = (i % 5) * 4;
    const z = Math.floor(i / 5) * 4;
    const id = `room${i}`;
    rooms.push({ id, name: `Room ${i + 1}`, rect: [x, z, 4, 4], floor: i % 2 ? 'oak' : 'tile' });
    TYPES.forEach((type, k) => {
      const n = i * 5 + k;
      const light = { id: `${id}.l${k}`, name: `Light ${n + 1}`, room: id, type, pos: [x + 0.8 + (k % 3) * 1.2, z + 0.8 + Math.floor(k / 3) * 2.2],
        link: { service: 'homeassistant', id: `light.demo_many_${n}` } };
      if (type === 'cans') light.points = [[x + 1, z + 1], [x + 3, z + 1], [x + 1, z + 3], [x + 3, z + 3]];
      if (type === 'cans') light.pos = [x + 2, z + 2];
      if (type === 'strip') Object.assign(light, { y: 1.2, length: 1.5, pos: [x + 2, z + 0.1] });
      lights.push(light);
    });
  }
  const openings = [];
  for (let i = 0; i < 10; i++) {
    const x = (i % 5) * 4;
    const z = Math.floor(i / 5) * 4;
    if (i % 5 < 4) openings.push({ type: 'door', from: [x + 4, z + 1.5], to: [x + 4, z + 2.4] });
    if (i < 5) openings.push({ type: 'door', from: [x + 1.5, z + 4], to: [x + 2.4, z + 4] });
  }
  return { name: 'Many lights', rooms, openings, lights, scenes: [] };
}

export function manyLightsStates(on = 20) {
  return Object.fromEntries(Array.from({ length: 50 }, (_, n) => {
    const id = `light.demo_many_${n}`;
    const lit = n < on;
    return [id, {
      entity_id: id, state: lit ? 'on' : 'off',
      attributes: { friendly_name: `Many ${n + 1}`, supported_color_modes: ['brightness'], color_mode: lit ? 'brightness' : null, brightness: lit ? 220 : null },
    }];
  }));
}
