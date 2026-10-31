export const BOARD = { width: 1152, height: 620, cols: 24, rows: 12, tile: 43, left: 60, top: 48 } as const;

export type Cell = { x: number; y: number };
export type ModelId = 'lamp' | 'tree' | 'bench' | 'limit' | 'police';

export interface ModelDefinition {
  id: ModelId;
  name: string;
  cost: number;
  beauty: number;
  noise: number;
  crime: number;
  comfort: number;
  caption: string;
}

export const MODELS: ModelDefinition[] = [
  { id: 'lamp', name: 'Gas Lamppost', cost: 35, beauty: 1, noise: 0, crime: -2, comfort: -0.63, caption: 'A little light for safer nights.' },
  { id: 'tree', name: 'Oak Tree', cost: 40, beauty: 3, noise: -1, crime: 0, comfort: -0.67, caption: 'A quieter, greener journey.' },
  { id: 'bench', name: 'Park Bench', cost: 25, beauty: 2, noise: 0, crime: 0, comfort: -0.43, caption: 'A place to stop and belong.' },
  { id: 'limit', name: 'Speed Sign', cost: 30, beauty: 0, noise: -2, crime: 0, comfort: -0.56, caption: 'A gentler pace for the town.' },
  { id: 'police', name: 'Police Box', cost: 55, beauty: 0, noise: 0, crime: -3, comfort: -0.79, caption: 'A reassuring local presence.' }
];

export const HOMES = [
  { id: 0, x: 3, y: 2, name: 'The Finch family', color: 0xc9b48e, temperament: 1.0 },
  { id: 1, x: 7, y: 1, name: 'The Parkers', color: 0xacc1bb, temperament: 0.9 },
  { id: 2, x: 14, y: 1, name: 'The Millers', color: 0xc8977e, temperament: 1.05 },
  { id: 3, x: 21, y: 5, name: 'The Marshes', color: 0xe4c9a0, temperament: 1.1 },
  { id: 4, x: 14, y: 11, name: 'The Bennetts', color: 0x8fae9c, temperament: 0.95 },
  { id: 5, x: 1, y: 7, name: 'The Wards', color: 0xada6be, temperament: 1.15 }
] as const;

const vertices: Cell[] = [
  { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 2 }, { x: 9, y: 2 },
  { x: 9, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 2 }, { x: 17, y: 2 },
  { x: 17, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 9 }, { x: 17, y: 9 },
  { x: 17, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 9 },
  { x: 9, y: 9 }, { x: 9, y: 10 }, { x: 5, y: 10 }, { x: 5, y: 9 },
  { x: 2, y: 9 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 3, y: 3 }
];

function expandRoad(points: Cell[]): Cell[] {
  const cells: Cell[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const dx = Math.sign(end.x - start.x);
    const dy = Math.sign(end.y - start.y);
    const steps = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    for (let n = 1; n <= steps; n += 1) {
      cells.push({ x: start.x + dx * n, y: start.y + dy * n });
    }
  }
  cells.pop(); // The final point is the first point again.
  return cells;
}

export const ROAD_CELLS = expandRoad(vertices);
export const ROAD_SET = new Set(ROAD_CELLS.map((cell) => cell.x + ',' + cell.y));

export const isRoad = (x: number, y: number): boolean => ROAD_SET.has(x + ',' + y);
export const isOnBoard = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < BOARD.cols && y < BOARD.rows;
export const adjacentToRoad = (x: number, y: number): boolean =>
  ROAD_CELLS.some((cell) => Math.abs(cell.x - x) + Math.abs(cell.y - y) === 1);
export const worldPoint = (cell: Cell) => ({
  x: BOARD.left + cell.x * BOARD.tile + BOARD.tile / 2,
  y: BOARD.top + cell.y * BOARD.tile + BOARD.tile / 2
});
