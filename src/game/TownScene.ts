import { Scene } from 'phaser';
import { BOARD, EFFECT_RADIUS, HOMES, isOnBoard, manhattanDistance, ROAD_CELLS, SCENERY_CELLS, worldPoint, type Cell, type ModelId } from './config';
import { store, type JourneyReaction } from './state';
import { normalizedCare } from './economy';
import { BIN_CAPACITY, BIN_CATCH_RADIUS } from './bins';
import { type EnvironmentalEvent, type LivingEnvironment } from './environment';
import { HOME_TRAVEL_SECONDS, newCarCycle, stepCarCycle, type CarCycle } from './traffic';

interface Car {
  residentId: number;
  container: Phaser.GameObjects.Container;
  startIndex: number;
  cycle: CarCycle;
  tileIndex: number;
  speed: number;
  speedFactor: number;
  homeBadge: Phaser.GameObjects.Text;
  lastThoughtAt: number;
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
  private environmentLayer!: Phaser.GameObjects.Graphics;
  private lastEnvironmentalEventId = 0;
  private observedEnvironment: LivingEnvironment | null = null;
  private homeLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private influenceLayer!: Phaser.GameObjects.Graphics;
  private ghostLayer!: Phaser.GameObjects.Graphics;
  private lastPlacementCount = 0;
  private cars: Car[] = [];

  constructor() { super('TownScene'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#111515');
    this.drawBoard();
    this.drawScenery();
    this.drawRoad();

    // Roadside changes are drawn above the road and below cars and models.
    this.environmentLayer = this.add.graphics();
    this.modelLayer = this.add.graphics();
    this.homeLayer = this.add.graphics();
    this.influenceLayer = this.add.graphics();
    this.highlightLayer = this.add.graphics();
    this.ghostLayer = this.add.graphics().setAlpha(0.68);
    this.cars = HOMES.map((home, index) => this.createCar(home.id, index));

    this.lastPlacementCount = store.placements.length;
    this.observedEnvironment = store.environment;
    this.drawDynamic();
    const unsubscribe = store.subscribe(() => {
      if (this.observedEnvironment !== store.environment) {
        this.observedEnvironment = store.environment;
        this.lastEnvironmentalEventId = 0;
      }
      this.drawDynamic();
      const environmentalEvent = store.lastEnvironmentEvent;
      if (environmentalEvent && environmentalEvent.effectId !== this.lastEnvironmentalEventId) {
        this.lastEnvironmentalEventId = environmentalEvent.effectId;
        this.animateEnvironmentEvent(environmentalEvent);
      }
      if (store.placements.length > this.lastPlacementCount && store.phase === 'playing') {
        const latest = store.placements[store.placements.length - 1];
        this.animatePlacement(worldPoint(latest));
      }
      this.lastPlacementCount = store.placements.length;
    });
    this.events.once('shutdown', unsubscribe);

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      store.setHovered(this.pointerCell(pointer));
    });
    // A tap selects a tile; a swipe is reserved for navigating the town.
    // Placing on pointer-down made mobile panning buy models accidentally.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const travelled = Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY);
      if (travelled > 13) return;
      const cell = this.pointerCell(pointer);
      if (cell && store.phase === 'playing' && !store.paused && !store.workshopOpen) {
        store.selectTile(cell);
        const home = HOMES.find(item => item.x === cell.x && item.y === cell.y);
        if (home && !store.activeModel) store.selectResident(home.id);
      }
    });
    // Keep the last preview in view while the player reads the forecast.
    this.input.on('gameout', () => {
      if (!store.activeModel) store.setHovered(null);
    });
  }

  private pointerCell(pointer: Phaser.Input.Pointer): Cell | null {
    // Phaser's cached canvas bounds are not updated by CSS overflow scrolling.
    // Use live browser coordinates so the right-hand end of the town remains
    // interactive after swiping horizontally across a phone screen.
    const event = pointer.event as MouseEvent | TouchEvent | undefined;
    const touch = event && 'changedTouches' in event
      ? (event.changedTouches[0] || event.touches[0]) : undefined;
    const clientX = touch?.clientX ?? (event as MouseEvent | undefined)?.clientX;
    const clientY = touch?.clientY ?? (event as MouseEvent | undefined)?.clientY;
    const rect = this.game.canvas.getBoundingClientRect();
    const worldX = Number.isFinite(clientX) && rect.width > 0
      ? ((clientX as number) - rect.left) / rect.width * BOARD.width
      : pointer.worldX;
    const worldY = Number.isFinite(clientY) && rect.height > 0
      ? ((clientY as number) - rect.top) / rect.height * BOARD.height
      : pointer.worldY;
    const x = Math.floor((worldX - BOARD.left) / BOARD.tile);
    const y = Math.floor((worldY - BOARD.top) / BOARD.tile);
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

    this.add.text(54, 589, 'THE GENERATIONAL CYCLE  /  HANDMADE TOWN, 1908', {
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
    const plots: Cell[] = SCENERY_CELLS.slice(0, 10);
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
    const homeCell = worldPoint(home);
    const startIndex = ROAD_CELLS.findIndex(cell => manhattanDistance(cell, home) === 1);
    if (startIndex < 0) throw new Error('House without adjacent road: ' + home.name);
    const start = worldPoint(ROAD_CELLS[startIndex]);
    container.setPosition(start.x, start.y);
    const homeBadge = this.add.text(homeCell.x, homeCell.y - 36, 'HOME', {
      fontFamily: 'Georgia, serif',
      fontSize: '9px',
      color: '#decba8',
      backgroundColor: '#19251d',
      padding: { x: 5, y: 3 }
    }).setOrigin(0.5).setDepth(18).setVisible(false);
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
      startIndex,
      cycle: newCarCycle(),
      tileIndex: -1,
      speed: 85 + index * 4,
      speedFactor: 1,
      homeBadge,
      lastThoughtAt: -20000
    };
  }

  private drawHouse(g: Phaser.GameObjects.Graphics, home: typeof HOMES[number]): void {
    const resident = store.residents[home.id];
    const point = worldPoint(home);
    const x = point.x, y = point.y;
    const ink = !resident?.occupied ? palette.danger
      : resident.irritation >= 72 ? palette.gold : palette.chalk;
    g.fillStyle(0x1c2220, 0.98);
    g.fillRect(x - 14, y - 9, 28, 25);
    g.lineStyle(1.5, ink, 0.9);
    g.strokeRect(x - 14, y - 9, 28, 25);
    g.strokeTriangle(x - 19, y - 9, x, y - 24, x + 19, y - 9);
    g.strokeRect(x - 4, y + 3, 8, 13);
    g.strokeRect(x + 6, y - 3, 5, 6);
    g.fillStyle(!resident?.occupied ? palette.danger
      : resident.irritation >= 72 ? palette.gold
      : resident.irritation >= 45 ? 0xd5bb85 : palette.mint, 0.9);
    g.fillCircle(x + 17, y - 20, 3);
    if (store.selectedResident === home.id) {
      g.lineStyle(1.6, palette.gold, 0.95);
      g.strokeRoundedRect(x - 23, y - 31, 46, 54, 5);
    }
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
    } else if (id === 'bin') {
      g.fillStyle(0x5c7565, 0.8);
      g.fillRect(x - 10, y - 14, 20, 26);
      g.lineStyle(1.8, palette.chalk, 0.95);
      g.strokeRect(x - 10, y - 14, 20, 26);
      g.strokeRoundedRect(x - 13, y - 19, 26, 7, 2);
      g.lineBetween(x - 8, y - 1, x + 8, y - 1);
      g.lineBetween(x - 6, y - 9, x + 6, y - 9);
      g.lineBetween(x - 4, y + 5, x + 4, y + 5);
    } else {
      g.strokeRect(x - 12, y - 12, 24, 29);
      g.strokeTriangle(x - 15, y - 12, x, y - 22, x + 15, y - 12);
      g.strokeRect(x - 5, y - 4, 10, 8);
      g.lineBetween(x - 15, y + 17, x + 15, y + 17);
    }
  }

  private animatePlacement(point: { x: number; y: number }): void {
    const circle = this.add.circle(point.x, point.y, 13, palette.mint, 0.13)
      .setStrokeStyle(2, palette.mint, 0.95).setDepth(12);
    this.tweens.add({
      targets: circle,
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: 550,
      ease: 'Sine.Out',
      onComplete: () => circle.destroy()
    });
  }

  private drawEnvironment(): void {
    const g = this.environmentLayer;
    g.clear();
    for (const effect of store.environment.effects) {
      const { x, y } = worldPoint(effect.cell);
      const variant = effect.id % 3;
      if (effect.kind === 'litter') {
        // Tiny scattered envelopes and wrappers, on the grass rather than on cars.
        g.fillStyle(0xc6c2b0, 0.8);
        g.fillTriangle(x - 13, y + 3, x - 5, y - 1 - variant, x - 4, y + 7);
        g.fillStyle(0xb5aa92, 0.8);
        g.fillRect(x + 4, y - 6, 9, 5);
        g.lineStyle(1.1, 0xeee4cb, 0.72);
        g.lineBetween(x + 4, y - 6, x + 13, y - 1);
        g.lineBetween(x - 1, y + 9, x + 6, y + 11);
      } else if (effect.kind === 'flowers') {
        const offset = variant * 2;
        g.lineStyle(1.5, 0x99bca4, 0.92);
        g.lineBetween(x - 8, y + 12, x - 8, y - 2 - offset);
        g.lineBetween(x + 6, y + 11, x + 6, y - 5);
        g.lineBetween(x - 8, y + 7, x - 13, y + 1);
        g.lineBetween(x + 6, y + 6, x + 12, y + 2);
        const petals = [
          [x - 8, y - 4 - offset], [x + 6, y - 8],
          [x + 13, y - 1]
        ];
        for (const [px, py] of petals) {
          g.fillStyle(0xd3c8a5, 0.95);
          g.fillCircle(px - 3, py, 3);
          g.fillCircle(px + 3, py, 3);
          g.fillCircle(px, py - 3, 3);
          g.fillCircle(px, py + 3, 3);
          g.fillStyle(palette.gold, 1);
          g.fillCircle(px, py, 1.8);
        }
      } else {
        // Curved tyre marks on the asphalt. A faded accent indicates a safety hazard.
        g.lineStyle(3, palette.danger, 0.63);
        g.lineBetween(x - 18, y - 7, x - 8, y - 11);
        g.lineBetween(x - 8, y - 11, x + 11, y - 6);
        g.lineBetween(x - 18, y + 2, x - 8, y - 2);
        g.lineBetween(x - 8, y - 2, x + 11, y + 3);
        g.lineStyle(1.1, palette.chalk, 0.5);
        g.strokeCircle(x + 16, y - 14, 4);
      }
    }
  }

  private animateEnvironmentEvent(event: EnvironmentalEvent): void {
    const point = worldPoint(event.cell);
    const helpful = event.tone === 'helpful';
    const ripple = this.add.circle(point.x, point.y, 7,
      helpful ? palette.mint : palette.gold, 0.12)
      .setStrokeStyle(1.8, helpful ? palette.mint : palette.gold, 0.82)
      .setDepth(25);
    this.tweens.add({
      targets: ripple, scale: 2.9, alpha: 0, duration: 900,
      ease: 'Sine.Out', onComplete: () => ripple.destroy()
    });
  }

  private drawDynamic(): void {
    if (!this.modelLayer) return;
    this.drawEnvironment();
    this.modelLayer.clear();
    this.homeLayer.clear();
    this.influenceLayer.clear();
    this.highlightLayer.clear();
    this.ghostLayer.clear();

    store.placements.forEach((placed) => {
      const point = worldPoint(placed);
      this.drawModel(this.modelLayer, point.x, point.y, placed.id);
      if (placed.id === 'bin') {
        const fill = Math.min(BIN_CAPACITY, Math.max(0, placed.fill ?? 0));
        const amount = fill / BIN_CAPACITY;
        // A tiny visible fill gauge beside each miniature; orange spill when full.
        this.modelLayer.fillStyle(0x101814, 0.86);
        this.modelLayer.fillRect(point.x + 13, point.y - 15, 6, 30);
        this.modelLayer.fillStyle(placed.overflowed ? palette.danger : palette.mint, 0.95);
        this.modelLayer.fillRect(point.x + 14, point.y + 14 - amount * 28, 4, amount * 28);
        this.modelLayer.lineStyle(0.8, palette.chalk, 0.72);
        this.modelLayer.strokeRect(point.x + 13, point.y - 15, 6, 30);
        if (placed.overflowed) {
          this.modelLayer.fillStyle(0xcbb89a, 0.95);
          this.modelLayer.fillTriangle(point.x - 19, point.y + 13,
            point.x - 13, point.y + 9, point.x - 6, point.y + 16);
          this.modelLayer.fillRect(point.x + 10, point.y + 15, 12, 3);
          this.modelLayer.lineStyle(2, palette.danger, 0.8);
          this.modelLayer.strokeCircle(point.x, point.y - 25, 5);
        }
      }
      const care = normalizedCare(placed.care);
      if (care !== 'full') {
        const wearColor = care === 'economy' ? palette.gold : palette.danger;
        this.modelLayer.fillStyle(wearColor, 0.88);
        this.modelLayer.fillCircle(point.x + 15, point.y + 14, 4.5);
        this.modelLayer.lineStyle(1.2, 0x151a18, 0.9);
        this.modelLayer.strokeCircle(point.x + 15, point.y + 14, 4.5);
        if (care === 'bare') {
          this.modelLayer.lineStyle(1.3, palette.danger, 0.82);
          this.modelLayer.lineBetween(point.x - 12, point.y + 14, point.x + 10, point.y + 7);
        }
      }
    });
    HOMES.forEach((home) => this.drawHouse(this.homeLayer, home));

    const cell = store.hovered || store.selected;
    if (!cell || !isOnBoard(cell.x, cell.y)) return;

    const preview = store.activeModel && store.phase === 'playing'
      ? store.previewPlacement(cell, store.activeModel)
      : null;
    const color = preview
      ? preview.allowed ? palette.mint : palette.danger
      : palette.gold;

    if (preview && preview.canPlace) {
      // The same Manhattan-radius footprint drives both the visual overlay
      // and passTile's actual car-irritation calculation.
      const visualRadius = store.activeModel === 'bin' ? BIN_CATCH_RADIUS : EFFECT_RADIUS;
      for (let x = cell.x - visualRadius; x <= cell.x + visualRadius; x += 1) {
        for (let y = cell.y - visualRadius; y <= cell.y + visualRadius; y += 1) {
          const candidate = { x, y };
          if (!isOnBoard(x, y) || manhattanDistance(candidate, cell) > visualRadius) continue;
          this.influenceLayer.fillStyle(preview.allowed ? palette.mint : palette.danger, 0.075);
          this.influenceLayer.fillRect(
            BOARD.left + x * BOARD.tile + 2,
            BOARD.top + y * BOARD.tile + 2,
            BOARD.tile - 4, BOARD.tile - 4
          );
        }
      }
      ROAD_CELLS.filter((road) => manhattanDistance(road, cell) <= visualRadius)
        .forEach((road) => {
          const point = worldPoint(road);
          this.influenceLayer.lineStyle(2, palette.gold, preview.allowed ? 0.6 : 0.25);
          this.influenceLayer.strokeCircle(point.x, point.y, 13);
        });

      const point = worldPoint(cell);
      this.ghostLayer.setAlpha(preview.allowed ? 0.78 : 0.35);
      this.drawModel(this.ghostLayer, point.x, point.y, store.activeModel!);
    }

    const x = BOARD.left + cell.x * BOARD.tile;
    const y = BOARD.top + cell.y * BOARD.tile;
    this.highlightLayer.fillStyle(color, 0.12);
    this.highlightLayer.fillRect(x + 2, y + 2, BOARD.tile - 4, BOARD.tile - 4);
    this.highlightLayer.lineStyle(2.4, color, 0.94);
    this.highlightLayer.strokeRect(x + 2, y + 2, BOARD.tile - 4, BOARD.tile - 4);
    // Four registration marks make the square read as a model-kit placement target.
    const tick = 9;
    this.highlightLayer.lineStyle(2.5, color, 1);
    this.highlightLayer.lineBetween(x + 1, y + tick, x + 1, y + 1);
    this.highlightLayer.lineBetween(x + 1, y + 1, x + tick, y + 1);
    this.highlightLayer.lineBetween(x + BOARD.tile - tick, y + 1, x + BOARD.tile - 1, y + 1);
    this.highlightLayer.lineBetween(x + BOARD.tile - 1, y + 1, x + BOARD.tile - 1, y + tick);
    this.highlightLayer.lineBetween(x + 1, y + BOARD.tile - tick, x + 1, y + BOARD.tile - 1);
    this.highlightLayer.lineBetween(x + 1, y + BOARD.tile - 1, x + tick, y + BOARD.tile - 1);
    this.highlightLayer.lineBetween(x + BOARD.tile - tick, y + BOARD.tile - 1, x + BOARD.tile - 1, y + BOARD.tile - 1);
    this.highlightLayer.lineBetween(x + BOARD.tile - 1, y + BOARD.tile - 1, x + BOARD.tile - 1, y + BOARD.tile - tick);
  }

  private showCarThought(car: Car, reaction: JourneyReaction): void {
    if (this.time.now - car.lastThoughtAt < 12000) return;
    car.lastThoughtAt = this.time.now;
    const message = reaction.text.length > 35 ? reaction.text.slice(0, 32) + '…' : reaction.text;
    const width = Math.min(186, Math.max(92, message.length * 5.3 + 17));
    const bubble = this.add.container(car.container.x, car.container.y - 29).setDepth(20);
    const background = this.add.graphics();
    background.fillStyle(0x161d19, 0.97);
    background.fillRoundedRect(-width / 2, -24, width, 22, 5);
    background.lineStyle(1, reaction.calmer ? palette.mint : palette.gold, 0.78);
    background.strokeRoundedRect(-width / 2, -24, width, 22, 5);
    background.strokeTriangle(-5, -2, 2, 6, 8, -2);
    const label = this.add.text(0, -13, message, {
      fontFamily: 'Georgia, serif',
      fontSize: '10px',
      color: '#e5e4d7'
    }).setOrigin(0.5);
    bubble.add([background, label]);
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 16,
      alpha: 0,
      delay: 1150,
      duration: 1200,
      ease: 'Sine.Out',
      onComplete: () => bubble.destroy()
    });
  }

  private showLapCoins(car: Car, earned: number): void {
    if (earned <= 0) return;
    const x = car.container.x, y = car.container.y - 18;
    const bubble = this.add.container(x, y).setDepth(45);
    const ink = this.add.graphics();
    ink.fillStyle(palette.gold, 0.97);
    ink.fillCircle(-12, 1, 10);
    ink.lineStyle(1.4, 0xebe5ce, 1);
    ink.strokeCircle(-12, 1, 10);
    ink.lineStyle(1, 0x65512c, 0.9);
    ink.strokeCircle(-12, 1, 5);
    const amount = this.add.text(3, 0, '+' + earned, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#f4e5ba',
      stroke: '#121713',
      strokeThickness: 3
    }).setOrigin(0, 0.5);
    bubble.add([ink, amount]);
    this.tweens.add({
      targets: bubble,
      y: y - 43,
      alpha: 0,
      duration: 1700,
      ease: 'Cubic.Out',
      onComplete: () => bubble.destroy()
    });
  }

  update(_time: number, delta: number): void {
    if (store.paused || store.workshopOpen || store.phase !== 'playing') return;
    const length = ROAD_CELLS.length;
    const totalDistance = length * BOARD.tile;
    const dt = Math.min(delta, 60) / 1000 * store.gameSpeed;
    store.tickEconomy(dt);

    this.cars.forEach((car) => {
      const resident = store.residents[car.residentId];
      if (!resident?.occupied) {
        car.container.setVisible(false);
        car.homeBadge.setVisible(false);
        return;
      }

      const homePoint = worldPoint(HOMES[car.residentId]);
      const roadPoint = worldPoint(ROAD_CELLS[car.startIndex]);
      const beforeDistance = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
      const beforeIndex = Math.min(length - 1, Math.floor(beforeDistance / BOARD.tile));
      // Care levels affect how clearly drivers heed the speed sign.
      const targetFactor = store.speedMultiplierAt(ROAD_CELLS[beforeIndex]);
      car.speedFactor += (targetFactor - car.speedFactor) * Math.min(1, dt * 7);
      const completed = stepCarCycle(car.cycle, dt, car.speed * car.speedFactor * dt, totalDistance);
      if (completed) {
        const earned = store.finishLap(car.residentId);
        this.showLapCoins(car, earned);
        car.tileIndex = -1;
      }

      car.container.setVisible(true);
      car.homeBadge.setVisible(car.cycle.phase === 'at-home');

      if (car.cycle.phase === 'driving') {
        const distance = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
        const index = Math.min(length - 1, Math.floor(distance / BOARD.tile));
        let reaction: JourneyReaction | null = null;
        if (index !== car.tileIndex) {
          car.tileIndex = index;
          reaction = store.passTile(car.residentId, ROAD_CELLS[index]);
        }
        const part = (distance % BOARD.tile) / BOARD.tile;
        const current = worldPoint(ROAD_CELLS[index]);
        const next = worldPoint(ROAD_CELLS[(index + 1) % length]);
        car.container.setPosition(
          current.x + (next.x - current.x) * part,
          current.y + (next.y - current.y) * part
        );
        car.container.setRotation(Math.atan2(next.y - current.y, next.x - current.x));
        if (reaction) this.showCarThought(car, reaction);
      } else {
        const t = car.cycle.phase === 'at-home' ? 1 :
          car.cycle.phase === 'returning'
            ? Math.min(1, car.cycle.timer / HOME_TRAVEL_SECONDS)
            : 1 - Math.min(1, car.cycle.timer / HOME_TRAVEL_SECONDS);
        const smooth = t * t * (3 - 2 * t);
        car.container.setPosition(
          roadPoint.x + (homePoint.x - roadPoint.x) * smooth,
          roadPoint.y + (homePoint.y - roadPoint.y) * smooth
        );
        car.container.setRotation(car.cycle.phase === 'at-home' ? 0 :
          Math.atan2(homePoint.y - roadPoint.y, homePoint.x - roadPoint.x) +
          (car.cycle.phase === 'departing' ? Math.PI : 0));
      }
    });
  }
}
