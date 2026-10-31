import { Scene } from 'phaser';
import { BOARD, HOMES, isOnBoard, MODELS, ROAD_CELLS, worldPoint, type Cell, type ModelId } from './config';
import { store } from './state';

interface Car {
  residentId: number;
  container: Phaser.GameObjects.Container;
  distance: number;
  tileIndex: number;
  speed: number;
}

const palette = {
  chalk: 0xd9d9cd,
  faded: 0x676d67,
  gold: 0xc9a66a,
  mint: 0xa4d9c4,
  danger: 0xd99d91,
  asphalt: 0x222827
};

export class TownScene extends Scene {
  private modelLayer!: Phaser.GameObjects.Graphics;
  private homeLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private cars: Car[] = [];

  constructor() { super('TownScene'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#111515');
    this.drawBoard();
    this.drawScenery();
    this.drawRoad();

    this.modelLayer = this.add.graphics();
    this.homeLayer = this.add.graphics();
    this.highlightLayer = this.add.graphics();
    this.cars = HOMES.map((home, index) => this.createCar(home.id, index));

    this.drawDynamic();
    const unsubscribe = store.subscribe(() => this.drawDynamic());
    this.events.once('shutdown', unsubscribe);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      store.setHovered(this.pointerCell(pointer));
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const cell = this.pointerCell(pointer);
      if (cell && store.phase === 'playing' && !store.paused && !store.workshopOpen) {
        store.selectTile(cell);
      }
    });
    this.input.on('gameout', () => store.setHovered(null));
  }

  private pointerCell(pointer: Phaser.Input.Pointer): Cell | null {
    const x = Math.floor((pointer.worldX - BOARD.left) / BOARD.tile);
    const y = Math.floor((pointer.worldY - BOARD.top) / BOARD.tile);
    return isOnBoard(x, y) ? { x, y } : null;
  }

  private drawBoard(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x151a18, 1);
    graphics.fillRoundedRect(28, 18, 1096, 566, 18);
    graphics.lineStyle(1, 0x6c7269, 0.45);
    graphics.strokeRoundedRect(28, 18, 1096, 566, 18);

    graphics.lineStyle(1, 0x8b9187, 0.12);
    for (let c = 0; c <= BOARD.cols; c += 1) {
      const x = BOARD.left + c * BOARD.tile;
      graphics.lineBetween(x, BOARD.top, x, BOARD.top + BOARD.rows * BOARD.tile);
    }
    for (let r = 0; r <= BOARD.rows; r += 1) {
      const y = BOARD.top + r * BOARD.tile;
      graphics.lineBetween(BOARD.left, y, BOARD.left + BOARD.cols * BOARD.tile, y);
    }
    graphics.lineStyle(1, palette.gold, 0.42);
    graphics.strokeRect(BOARD.left - 4, BOARD.top - 4,
      BOARD.cols * BOARD.tile + 8, BOARD.rows * BOARD.tile + 8);

    this.add.text(54, 589, 'MODEL LOOP  /  HANDMADE TOWN, 1908', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#858b80', letterSpacing: 2
    });
    this.add.text(1089, 589, 'VINTAGE SERIES 01', {
      fontFamily: 'Georgia, serif', fontSize: '11px', color: '#858b80'
    }).setOrigin(1, 0);
  }

  private drawRoad(): void {
    const g = this.add.graphics();
    const points = ROAD_CELLS.map(worldPoint);
    const trace = () => {
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
      g.closePath();
      g.strokePath();
    };
    g.lineStyle(50, 0xa0a39a, 0.85);
    trace();
    g.lineStyle(46, 0x111716, 1);
    trace();
    g.lineStyle(39, palette.asphalt, 1);
    trace();
    g.lineStyle(1.5, 0xd5d0bd, 0.65);
    for (let i = 0; i < points.length; i += 1) {
      const from = points[i], to = points[(i + 1) % points.length];
      for (let part = 0.08; part < 0.9; part += 0.34) {
        const end = Math.min(0.9, part + 0.17);
        g.lineBetween(
          from.x + (to.x - from.x) * part,
          from.y + (to.y - from.y) * part,
          from.x + (to.x - from.x) * end,
          from.y + (to.y - from.y) * end
        );
      }
    }
  }

  private drawScenery(): void {
    const g = this.add.graphics();
    const plots: Cell[] = [
      { x: 7, y: 5 }, { x: 6, y: 7 }, { x: 15, y: 7 }, { x: 18, y: 6 },
      { x: 4, y: 5 }, { x: 22, y: 2 }, { x: 0, y: 10 }, { x: 19, y: 11 },
      { x: 11, y: 7 }, { x: 10, y: 5 }
    ];
    plots.forEach((cell, i) => {
      const point = worldPoint(cell);
      this.drawTree(g, point.x, point.y, i % 3 === 0 ? 21 : 16);
    });

    const hall = worldPoint({ x: 11, y: 6 });
    g.fillStyle(0x212725, 0.96);
    g.fillRoundedRect(hall.x - 41, hall.y - 20, 82, 59, 3);
    g.lineStyle(2, palette.chalk, 0.72);
    g.strokeRect(hall.x - 41, hall.y - 20, 82, 59);
    g.strokeTriangle(hall.x - 48, hall.y - 20, hall.x, hall.y - 49, hall.x + 48, hall.y - 20);
    g.strokeRect(hall.x - 6, hall.y - 61, 12, 23);
    g.strokeCircle(hall.x, hall.y - 52, 3.5);
    for (let x = hall.x - 27; x <= hall.x + 27; x += 18) {
      g.strokeRect(x - 4, hall.y - 7, 8, 14);
    }
    g.strokeRect(hall.x - 6, hall.y + 10, 12, 29);
    this.add.text(hall.x, hall.y + 45, 'TOWN HALL', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#a7afa4'
    }).setOrigin(0.5);

    const fountain = worldPoint({ x: 16, y: 6 });
    g.lineStyle(1.5, 0xb9ccc8, 0.86);
    g.strokeEllipse(fountain.x, fountain.y + 9, 49, 17);
    g.strokeEllipse(fountain.x, fountain.y + 4, 37, 13);
    g.lineBetween(fountain.x, fountain.y - 21, fountain.x, fountain.y + 3);
    g.strokeEllipse(fountain.x, fountain.y - 14, 19, 6);
    g.fillStyle(0xa0c5c2, 0.28);
    g.fillEllipse(fountain.x, fountain.y + 7, 33, 8);

    const notice = worldPoint({ x: 7, y: 7 });
    g.lineStyle(1.3, palette.chalk, 0.65);
    g.strokeRect(notice.x - 25, notice.y - 7, 50, 19);
    g.lineBetween(notice.x - 19, notice.y + 12, notice.x - 19, notice.y + 23);
    g.lineBetween(notice.x + 19, notice.y + 12, notice.x + 19, notice.y + 23);
    this.add.text(notice.x, notice.y - 2, 'TOWN PARK', {
      fontFamily: 'Georgia, serif', fontSize: '8px', color: '#c6c5b8'
    }).setOrigin(0.5);
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
    g.lineStyle(1.4, 0xb8c5b5, 0.65);
    g.lineBetween(x, y + size * 0.2, x, y + size * 0.86);
    g.lineBetween(x, y + size * 0.48, x - size * 0.38, y + size * 0.12);
    g.strokeCircle(x - size * 0.35, y - size * 0.14, size * 0.39);
    g.strokeCircle(x + size * 0.3, y - size * 0.2, size * 0.43);
    g.strokeCircle(x, y - size * 0.46, size * 0.51);
    g.fillStyle(0x839b86, 0.14);
    g.fillCircle(x, y - size * 0.2, size * 0.58);
  }

  private createCar(residentId: number, index: number): Car {
    const home = HOMES[index];
    const container = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x0a0e0e, 0.97);
    g.fillRoundedRect(-15, -10, 28, 20, 3);
    g.fillStyle(home.color);
    g.fillRoundedRect(-13, -6, 25, 12, 3);
    g.fillStyle(0x121b1a);
    g.fillRect(-4, -5, 7, 10);
    g.lineStyle(1.2, palette.chalk, 0.8);
    g.strokeRoundedRect(-13, -6, 25, 12, 3);
    g.strokeRect(-4, -5, 7, 10);
    g.fillStyle(0x090a0a);
    g.fillRoundedRect(-10, -10, 9, 4, 1);
    g.fillRoundedRect(-10, 6, 9, 4, 1);
    g.fillStyle(palette.gold, 1);
    g.fillCircle(12, -4, 2);
    g.fillCircle(12, 4, 2);
    container.add(g);
    return {
      residentId,
      container,
      distance: (ROAD_CELLS.length * BOARD.tile / HOMES.length) * index,
      tileIndex: -1,
      speed: 85 + index * 4
    };
  }

  private drawHouse(g: Phaser.GameObjects.Graphics, home: typeof HOMES[number]): void {
    const resident = store.residents[home.id];
    const point = worldPoint(home);
    const x = point.x, y = point.y;
    const ink = resident?.occupied ? palette.chalk : palette.danger;
    g.fillStyle(0x1c2220, 0.98);
    g.fillRect(x - 14, y - 9, 28, 25);
    g.lineStyle(1.5, ink, 0.9);
    g.strokeRect(x - 14, y - 9, 28, 25);
    g.strokeTriangle(x - 19, y - 9, x, y - 24, x + 19, y - 9);
    g.strokeRect(x - 4, y + 3, 8, 13);
    g.strokeRect(x + 6, y - 3, 5, 6);
    g.fillStyle(resident?.occupied ? palette.mint : palette.danger, 0.9);
    g.fillCircle(x + 17, y - 20, 3);
    if (!resident?.occupied) {
      g.lineStyle(2, palette.danger, 0.8);
      g.lineBetween(x - 10, y - 4, x + 10, y + 12);
      g.lineBetween(x + 10, y - 4, x - 10, y + 12);
    }
  }

  private drawModel(g: Phaser.GameObjects.Graphics, x: number, y: number, id: ModelId): void {
    g.fillStyle(0xc9b58f, 0.14);
    g.fillEllipse(x, y + 11, 34, 12);
    g.lineStyle(1.8, palette.chalk, 0.95);
    if (id === 'lamp') {
      g.lineBetween(x, y + 12, x, y - 15);
      g.lineBetween(x - 6, y + 12, x + 6, y + 12);
      g.strokeRect(x - 6, y - 23, 12, 11);
      g.strokeTriangle(x - 8, y - 23, x, y - 31, x + 8, y - 23);
      g.fillStyle(palette.gold, 0.55);
      g.fillCircle(x, y - 18, 4);
    } else if (id === 'tree') {
      this.drawTree(g, x, y, 21);
    } else if (id === 'bench') {
      g.strokeRect(x - 17, y - 3, 34, 10);
      g.lineBetween(x - 13, y + 7, x - 13, y + 15);
      g.lineBetween(x + 13, y + 7, x + 13, y + 15);
      g.lineBetween(x - 17, y - 7, x + 17, y - 7);
    } else if (id === 'limit') {
      g.lineBetween(x, y + 16, x, y - 9);
      g.strokeCircle(x, y - 17, 12);
      g.fillStyle(0xc9a66a, 0.8);
      g.fillCircle(x, y - 17, 2);
    } else {
      g.strokeRect(x - 12, y - 12, 24, 29);
      g.strokeTriangle(x - 15, y - 12, x, y - 22, x + 15, y - 12);
      g.strokeRect(x - 5, y - 4, 10, 8);
      g.lineBetween(x - 15, y + 17, x + 15, y + 17);
    }
  }

  private drawDynamic(): void {
    if (!this.modelLayer) return;
    this.modelLayer.clear();
    this.homeLayer.clear();
    this.highlightLayer.clear();

    store.placements.forEach((placed) => {
      const point = worldPoint(placed);
      this.drawModel(this.modelLayer, point.x, point.y, placed.id);
    });
    HOMES.forEach((home) => this.drawHouse(this.homeLayer, home));

    const cell = store.hovered || store.selected;
    if (cell && isOnBoard(cell.x, cell.y)) {
      const x = BOARD.left + cell.x * BOARD.tile;
      const y = BOARD.top + cell.y * BOARD.tile;
      const allowed = store.canPlace(cell);
      const color = store.activeModel ? (allowed ? palette.mint : palette.danger) : palette.gold;
      this.highlightLayer.fillStyle(color, 0.13);
      this.highlightLayer.fillRect(x + 2, y + 2, BOARD.tile - 4, BOARD.tile - 4);
      this.highlightLayer.lineStyle(2.5, color, 0.95);
      this.highlightLayer.strokeRect(x + 2, y + 2, BOARD.tile - 4, BOARD.tile - 4);
    }
  }

  update(_time: number, delta: number): void {
    if (store.paused || store.workshopOpen || store.phase !== 'playing') return;
    const length = ROAD_CELLS.length;
    const totalDistance = length * BOARD.tile;
    const dt = Math.min(delta, 60) / 1000 * store.gameSpeed;

    this.cars.forEach((car) => {
      const resident = store.residents[car.residentId];
      if (!resident?.occupied) {
        car.container.setVisible(false);
        return;
      }
      car.container.setVisible(true);
      car.distance += car.speed * dt;
      if (car.distance >= totalDistance) {
        car.distance %= totalDistance;
        store.finishLap(car.residentId);
      }
      const index = Math.floor(car.distance / BOARD.tile);
      if (index !== car.tileIndex) {
        car.tileIndex = index;
        store.passTile(car.residentId, ROAD_CELLS[index]);
      }
      const part = (car.distance % BOARD.tile) / BOARD.tile;
      const current = worldPoint(ROAD_CELLS[index]);
      const next = worldPoint(ROAD_CELLS[(index + 1) % length]);
      car.container.setPosition(
        current.x + (next.x - current.x) * part,
        current.y + (next.y - current.y) * part
      );
      car.container.setRotation(Math.atan2(next.y - current.y, next.x - current.x));
    });
  }
}
