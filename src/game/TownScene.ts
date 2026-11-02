import { Scene } from 'phaser';
import { BOARD, EFFECT_RADIUS, HOMES, MODELS, isOnBoard, manhattanDistance, ROAD_CELLS, SCENERY_CELLS, worldPoint, type Cell, type ModelId } from './config';
import { miniatureDataUri, miniatureTextureKey, MODEL_ART_WIDTH, MODEL_ART_HEIGHT } from '../ui/modelArt';
import {
  carSvg, carTextureKey, carVariants, houseSvg, houseTextureKey,
  scenerySvg, sceneryTextureKey, sceneryVariants, sceneryDimensions,
  worldSvgDataUri, WORLD_CAR_SIZE, WORLD_HOUSE_SIZE
} from '../ui/vintageWorldArt';
import { store, type JourneyReaction } from './state';
import { normalizedCare, modelCondition } from './economy';
import type { RoadsideIncident } from './damage';
import { BIN_CAPACITY, BIN_CATCH_RADIUS } from './bins';
import { type EnvironmentalEvent, type LivingEnvironment } from './environment';
import { householdActionPair, type BehaviourReport } from './behaviors';
import { type ActiveActivity } from './activities';
import type { NeighbourNote } from './neighbours';
import { bendSpeedMultiplier, drivingProfile, type DrivingProfile } from './driving';
import {
  HOME_DWELL_SECONDS, HOME_TRAVEL_SECONDS, TRAFFIC_LANE_CHANGE_SECONDS,
  TRAFFIC_LEFT_LANE_OFFSET, TRAFFIC_PASSING_LANE_OFFSET, advanceTraffic,
  canReserveRoad, newCarCycle, passingLaneBlockedAhead, planLaneChanges,
  preferredRoadLaneOffset, roadPoseAt, stepCarCycle,
  type CarCycle, type RoadLane, type RoadVehicle
} from './traffic';

interface Car {
  residentId: number;
  container: Phaser.GameObjects.Container;
  startIndex: number;
  cycle: CarCycle;
  tileIndex: number;
  speed: number;
  speedFactor: number;
  driver: DrivingProfile;
  lane: RoadLane;
  changingTo: RoadLane | null;
  laneChangeElapsed: number;
  laneOffset: number;
  parkedForActivity: boolean;
  parkingCell: Cell | null;
  homeBadge: Phaser.GameObjects.Text;
  brakeLights: Phaser.GameObjects.Graphics;
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
  private lastRoadsideIncidentId = 0;
  private lastNeighbourNoteId = 0;
  private observedEnvironment: LivingEnvironment | null = null;
  private homeLayer!: Phaser.GameObjects.Graphics;
  private highlightLayer!: Phaser.GameObjects.Graphics;
  private influenceLayer!: Phaser.GameObjects.Graphics;
  private ghostLayer!: Phaser.GameObjects.Graphics;
  private trafficLayer!: Phaser.GameObjects.Graphics;
  private trafficLabel!: Phaser.GameObjects.Text;
  private lastStopId = 0;
  private lastBehaviourSequence = 0;
  private feedbackChips: Phaser.GameObjects.Text[] = [];
  private activityLabels = new Map<number, Phaser.GameObjects.Text>();
  private lastPlacementCount = 0;
  private cars: Car[] = [];
  // Cached Phaser images from the EXACT same SVG source used in shop cartons.
  // Existing sprites are reused on each state notification (never recreated
  // per frame); a placed kit keeps its physical tile footprint unchanged.
  private kitSprites = new Map<string, Phaser.GameObjects.Image>();
  private kitGhost!: Phaser.GameObjects.Image;
  private houseSprites: Phaser.GameObjects.Image[] = [];
  private scenerySprites: Phaser.GameObjects.Image[] = [];

  constructor() { super('TownScene'); }

  preload(): void {
    // Data SVGs need no network request. The loader decodes each once, caches
    // a single texture per model and reuses it for all placements and ghosts.
    // A scene restart must not enqueue duplicate keys.
    for (const model of MODELS) {
      const key = miniatureTextureKey(model.id);
      if (!this.textures.exists(key)) {
        this.load.svg(key, miniatureDataUri(model.id), {
          width: MODEL_ART_WIDTH * 2, height: MODEL_ART_HEIGHT * 2
        });
      }
    }
    // A single immutable texture per household and civic illustration.
    // The traffic update transforms existing images, never rasterizes SVGs.
    for (let i = 0; i < HOMES.length; i++) {
      const tint = '#' + HOMES[i].color.toString(16).padStart(6, '0');
      if (!this.textures.exists(carTextureKey(i))) {
        this.load.svg(carTextureKey(i), worldSvgDataUri(carSvg(i,tint)), {
          width: WORLD_CAR_SIZE.width * 2, height: WORLD_CAR_SIZE.height * 2
        });
      }
      if (!this.textures.exists(houseTextureKey(i))) {
        this.load.svg(houseTextureKey(i), worldSvgDataUri(houseSvg(i)), {
          width: WORLD_HOUSE_SIZE.width * 2, height: WORLD_HOUSE_SIZE.height * 2
        });
      }
    }
    for (const variant of sceneryVariants) {
      const key = sceneryTextureKey(variant);
      if (this.textures.exists(key)) continue;
      const size = sceneryDimensions[variant];
      this.load.svg(key, worldSvgDataUri(scenerySvg(variant)), {
        width: size.width * 2, height: size.height * 2
      });
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#111515');
    this.drawBoard();
    this.drawScenery();
    this.drawRoad();
    this.houseSprites = HOMES.map(home => {
      const point = worldPoint(home);
      return this.add.image(point.x, point.y + 22, houseTextureKey(home.id))
        .setOrigin(.5, 1).setDisplaySize(59, 70).setDepth(2);
    });

    // Roadside changes are drawn above the road and below cars and models.
    this.environmentLayer = this.add.graphics().setDepth(1);
    this.modelLayer = this.add.graphics().setDepth(3);
    this.homeLayer = this.add.graphics().setDepth(4);
    this.influenceLayer = this.add.graphics().setDepth(1);
    this.highlightLayer = this.add.graphics().setDepth(7);
    this.ghostLayer = this.add.graphics().setDepth(6).setAlpha(0.68);
    this.kitSprites.clear();
    this.kitGhost = this.add.image(0, 0, miniatureTextureKey('lamp'))
      .setDisplaySize(56, 45).setDepth(6).setVisible(false);
    this.trafficLayer = this.add.graphics().setDepth(19);
    this.trafficLabel = this.add.text(0, 0, '', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#eedab4',
      backgroundColor: '#19221b', padding: { x: 5, y: 3 }
    }).setOrigin(0.5).setDepth(22).setVisible(false);
    this.cars = HOMES.map((home, index) => this.createCar(home.id, index));

    this.lastPlacementCount = store.placements.length;
    this.observedEnvironment = store.environment;
    this.lastBehaviourSequence = store.latestBehaviourReport?.sequence ?? 0;
    this.lastNeighbourNoteId = store.neighbours.history[0]?.id ?? 0;
    this.drawDynamic();
    const unsubscribe = store.subscribe(() => {
      if (this.observedEnvironment !== store.environment) {
        this.observedEnvironment = store.environment;
        this.lastEnvironmentalEventId = 0;
        this.lastRoadsideIncidentId = 0;
        this.lastNeighbourNoteId = 0;
      }
      this.drawDynamic();
      const environmentalEvent = store.lastEnvironmentEvent;
      if (environmentalEvent && environmentalEvent.effectId !== this.lastEnvironmentalEventId) {
        this.lastEnvironmentalEventId = environmentalEvent.effectId;
        this.animateEnvironmentEvent(environmentalEvent);
      }
      const impact = store.accidents.latest;
      if (impact && impact.id !== this.lastRoadsideIncidentId) {
        this.lastRoadsideIncidentId = impact.id;
        this.animateRoadsideImpact(impact);
      }
      const neighbour = store.neighbours.history[0];
      if (neighbour && neighbour.id !== this.lastNeighbourNoteId) {
        this.lastNeighbourNoteId = neighbour.id;
        if (neighbour.kind === 'ward-visit' ||
            neighbour.kind === 'hale-restore' ||
            neighbour.kind === 'marsh-clean' ||
            neighbour.kind === 'marsh-admire')
          this.animateNeighbourResponse(neighbour);
      }
      const action = store.latestBehaviourReport;
      if (action && action.sequence !== this.lastBehaviourSequence) {
        this.lastBehaviourSequence = action.sequence;
        this.animateHouseholdAction(action);
      }
      if (store.placements.length > this.lastPlacementCount && store.phase === 'playing') {
        const latest = store.placements[store.placements.length - 1];
        this.animatePlacement(worldPoint(latest));
      }
      this.lastPlacementCount = store.placements.length;
    });
    this.events.once('shutdown', () => {
      unsubscribe();
      this.kitSprites.clear(); // Phaser scene shutdown destroys images.
      this.scenerySprites = [];
      this.houseSprites = [];
    });

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
        // Shift+click opens the full placement forecast without spending coins.
        // An ordinary click still places the selected model in one action.
        const modifier = pointer.event && 'shiftKey' in pointer.event &&
          pointer.event.shiftKey;
        if (modifier && store.activeModel) store.inspectTile(cell);
        else store.selectTile(cell);
        const home = HOMES.find(item => item.x === cell.x && item.y === cell.y);
        if (home && !store.activeModel) store.selectResident(home.id);
      }
    });
    // A short hover label must not linger after the pointer leaves the town.
    // Full placement forecasts are now opened deliberately by clicking a tile.
    this.input.on('gameout', () => {
      store.setHovered(null);
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
    const graphics = this.add.graphics().setDepth(-3);
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
    const g = this.add.graphics().setDepth(-1);
    const points = ROAD_CELLS.map(worldPoint);
    const trace = () => {
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
      g.closePath();
      g.strokePath();
    };
    // Drawn with a pair of period engraved curb rules, fine shadow, a subtle
    // paved strip and broken chalk centre markings. The original road cells,
    // actual width used by the lane planner and collision physics are intact.
    for (const [width,colour,alpha] of [
      [59,0x566056,.44],[57,0xd7d1bf,.66],[55,0x131815,1],
      [52,0xa8a99a,.58],[50,0x1a221c,1],[46,0x2A3029,1]
    ]) {
      g.lineStyle(width,colour,alpha);
      trace();
    }
    // Fine interrupted centre paint, not a cartoon solid stroke.
    g.lineStyle(1.18,0xe1d4b9,.68);
    for (let i = 0; i < points.length; i++) {
      const from = points[i], to = points[(i + 1) % points.length];
      for (let part=.13;part<.88;part+=.37) {
        const last=Math.min(.88,part+.17);
        g.lineBetween(
          from.x+(to.x-from.x)*part,from.y+(to.y-from.y)*part,
          from.x+(to.x-from.x)*last,from.y+(to.y-from.y)*last
        );
      }
    }
    // Engraved shoulder/paving seams outside the road. Short ticks avoid
    // ambiguous grid-like obstruction marks in the playable road itself.
    g.lineStyle(.9,0xc8c3af,.30);
    for(let i=0;i<points.length;i+=2) {
      const a=points[i],b=points[(i+1)%points.length];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const px=-dy/len,py=dx/len;
      for(const side of [-1,1]) {
        const x=a.x+px*side*25,y=a.y+py*side*25;
        g.lineBetween(x,y,x+px*side*4,y+py*side*4);
      }
    }
  }

  private drawScenery(): void {
    this.scenerySprites = [];
    // The ten existing reserved scenery plots remain exactly as before.
    // Plot 0 is now a bandstand in the park; the other nine are finely
    // etched oak variations. No extra land is taken from buildable tiles.
    SCENERY_CELLS.slice(0,10).forEach((cell,i)=>{
      const point=worldPoint(cell);
      const style = i===0?'bandstand' :
        (['oak-a','oak-b','oak-c'] as const)[i%3];
      const image=this.add.image(point.x,point.y+21,sceneryTextureKey(style))
        .setOrigin(.5,1)
        .setDisplaySize(i===0?59:53,i===0?57:61)
        .setDepth(i===0?2:1);
      this.scenerySprites.push(image);
    });
    const hall=worldPoint({x:11,y:6});
    this.scenerySprites.push(this.add.image(
      hall.x,hall.y+43,sceneryTextureKey('clock-hall'))
      .setOrigin(.5,1).setDisplaySize(111,112).setDepth(2));
    const fountain=worldPoint({x:16,y:6});
    this.scenerySprites.push(this.add.image(
      fountain.x,fountain.y+22,sceneryTextureKey('garden-fountain'))
      .setOrigin(.5,1).setDisplaySize(59,47).setDepth(2));
    const notice=worldPoint({x:7,y:7});
    this.scenerySprites.push(this.add.image(
      notice.x,notice.y+24,sceneryTextureKey('park-notice'))
      .setOrigin(.5,1).setDisplaySize(52,53).setDepth(2));
  }

  private createCar(residentId: number, index: number): Car {
    const home = HOMES[index];
    const driver = drivingProfile(residentId);
    const container = this.add.container(0, 0).setDepth(5);
    const homeCell = worldPoint(home);
    const startIndex = ROAD_CELLS.findIndex(cell => manhattanDistance(cell, home) === 1);
    if (startIndex < 0) throw new Error('House without adjacent road: ' + home.name);
    const start = roadPoseAt(startIndex * BOARD.tile);
    container.setPosition(start.x, start.y).setRotation(start.rotation);
    const homeBadge = this.add.text(homeCell.x, homeCell.y - 36, 'HOME', {
      fontFamily: 'Georgia, serif',
      fontSize: '9px',
      color: '#decba8',
      backgroundColor: '#19251d',
      padding: { x: 5, y: 3 }
    }).setOrigin(0.5).setDepth(18).setVisible(false);
    // Four real brass-era silhouettes are mapped to the six households.
    // Their cache images move and rotate in the SAME unchanged traffic
    // container, preserving following gaps, lane offsets and accident rules.
    const motorcar = this.add.image(0,0,carTextureKey(index))
      .setDisplaySize(45,26);
    const brakeLights = this.add.graphics();
    brakeLights.fillStyle(palette.danger,.92);
    brakeLights.fillCircle(-21,-6,1.9);
    brakeLights.fillCircle(-21,6,1.9);
    brakeLights.setVisible(false);
    container.add([motorcar,brakeLights]);
    return {
      residentId,
      container,
      startIndex,
      cycle: newCarCycle(),
      tileIndex: -1,
      speed: driver.cruiseSpeed,
      speedFactor: 1,
      driver,
      lane: 'left',
      changingTo: null,
      laneChangeElapsed: 0,
      laneOffset: TRAFFIC_LEFT_LANE_OFFSET,
      parkedForActivity: false,
      parkingCell: null,
      homeBadge,
      brakeLights,
      lastThoughtAt: -20000
    };
  }

  private drawHouse(g: Phaser.GameObjects.Graphics,home:typeof HOMES[number]):void {
    const resident=store.residents[home.id];
    const point=worldPoint(home);
    const house=this.houseSprites[home.id];
    if(house)house.setAlpha(resident?.occupied ? 1 : .48);
    // Occupancy, mood and selection remain distinct *live* game indicators,
    // not baked into the static architectural textures.
    const status=!resident?.occupied?palette.danger:
      resident.irritation>=72?palette.gold:
      resident.irritation>=45?0xd5bb85:palette.mint;
    g.fillStyle(0x121A14,.97);
    g.fillCircle(point.x+24,point.y-37,5.3);
    g.lineStyle(1,palette.chalk,.83);
    g.strokeCircle(point.x+24,point.y-37,5.3);
    g.fillStyle(status,.97);
    g.fillCircle(point.x+24,point.y-37,2.9);
    if(store.selectedResident===home.id){
      g.lineStyle(1.45,palette.gold,.96);
      g.strokeRoundedRect(point.x-29,point.y-49,58,75,4);
      g.lineStyle(.8,palette.chalk,.71);
      g.strokeRoundedRect(point.x-26,point.y-46,52,69,3);
    }
    if(!resident?.occupied){
      g.lineStyle(1.7,palette.danger,.91);
      g.lineBetween(point.x-13,point.y-4,point.x+13,point.y+13);
      g.lineBetween(point.x+13,point.y-4,point.x-13,point.y+13);
    }
  }

  /** Inspect the art pipeline from dev/Playwright without exposing simulation internals. */
  miniatureArtSnapshot(): {
    loaded: ModelId[]; placed: { cell: string; texture: string; alpha: number }[];
    ghost: { texture: string; visible: boolean; alpha: number };
  } {
    return {
      loaded: MODELS.filter(model =>
        this.textures.exists(miniatureTextureKey(model.id))).map(model=>model.id),
      placed: [...this.kitSprites.entries()].map(([cell,image])=>({
        cell, texture: image.texture.key, alpha: image.alpha
      })),
      ghost: this.kitGhost ? {
        texture: this.kitGhost.texture.key,
        visible: this.kitGhost.visible, alpha: this.kitGhost.alpha
      } : { texture: '', visible: false, alpha: 0 }
    };
  }

  /** Sync board models to purchased state using the cached shop SVG textures. */
  private syncKitSprites(): void {
    const current = new Set<string>();
    for (const placed of store.placements) {
      const cellKey = placed.x + ',' + placed.y;
      current.add(cellKey);
      const point = worldPoint(placed);
      const texture = miniatureTextureKey(placed.id);
      let image = this.kitSprites.get(cellKey);
      if (!image) {
        image = this.add.image(point.x, point.y - 7, texture)
          .setDepth(2).setDisplaySize(56, 45);
        this.kitSprites.set(cellKey, image);
      } else if (image.texture.key !== texture) {
        image.setTexture(texture);
      }
      const condition = modelCondition(placed.condition);
      image.setPosition(point.x, point.y - 7)
        .setAlpha(condition === 'broken' ? .42 :
          condition === 'damaged' ? .79 : 1);
    }
    // Old miniatures do not survive a new game, sale or scene reset.
    for (const [cellKey, image] of this.kitSprites) {
      if (!current.has(cellKey)) {
        image.destroy();
        this.kitSprites.delete(cellKey);
      }
    }
  }

  /**
   * Decorative tweens respect system motion preferences. Circulating cars
   * still move because motion is integral to the game; small effects do not.
   */
  private reduceMotion(): boolean {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private animateHouseholdAction(action: BehaviourReport): void {
    const point = worldPoint(action.cell);
    const pair = householdActionPair(action.residentId);
    const label = action.action === pair.helpful.id ? pair.helpful.label :
      pair.troublesome.label;
    const tint = action.tone === 'helpful' ? '#b5dbc1' : '#e4b894';
    // Brief descriptive chip; never more than three on the board at a time.
    const chip = this.add.text(point.x, point.y - 22,
      (action.tone === 'helpful' ? '+ ' : '! ') + label, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: tint,
        backgroundColor: '#131c16',
        padding: { x: 6, y: 4 }
      }).setOrigin(0.5).setDepth(47).setAlpha(0.98);
    this.feedbackChips.push(chip);
    while (this.feedbackChips.length > 3) this.feedbackChips.shift()?.destroy();
    const dispose = () => {
      chip.destroy();
      this.feedbackChips = this.feedbackChips.filter(item => item !== chip);
    };
    if (this.reduceMotion()) {
      this.time.delayedCall(850, dispose);
    } else {
      this.tweens.add({
        targets:chip, y:point.y - 36, alpha:0,
        delay:500, duration:1000, ease:'Sine.Out', onComplete:dispose
      });
    }
  }

  private animatePlacement(point: { x: number; y: number }): void {
    const circle = this.add.circle(point.x, point.y, 13, palette.mint, 0.13)
      .setStrokeStyle(2, palette.mint, 0.95).setDepth(12);
    if (this.reduceMotion()) {
      this.time.delayedCall(500, () => circle.destroy());
      return;
    }
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
      } else if (effect.kind === 'skid') {
        // The Finches have left chalk tyre scuffs across the road.
        g.lineStyle(3, palette.danger, 0.63);
        g.lineBetween(x - 18, y - 7, x - 8, y - 11);
        g.lineBetween(x - 8, y - 11, x + 11, y - 6);
        g.lineBetween(x - 18, y + 2, x - 8, y - 2);
        g.lineBetween(x - 8, y - 2, x + 11, y + 3);
        g.lineStyle(1.1, palette.chalk, 0.5);
        g.strokeCircle(x + 16, y - 14, 4);
      } else if (effect.kind === 'courtesy') {
        // The Finches' lightly etched path marks a smooth way through a bend.
        g.lineStyle(2.1, palette.mint, 0.88);
        g.lineBetween(x - 11, y - 5, x - 2, y);
        g.lineBetween(x - 2, y, x - 11, y + 5);
        g.lineBetween(x + 3, y - 5, x + 12, y);
        g.lineBetween(x + 12, y, x + 3, y + 5);
        g.lineStyle(1, palette.chalk, 0.7);
        g.strokeCircle(x, y, 15);
      } else if (effect.kind === 'mended') {
        // An etched rectangular road-repair patch with little stitches.
        g.fillStyle(0x667367, 0.35);
        g.fillRoundedRect(x - 15, y - 12, 30, 24, 3);
        g.lineStyle(1.3, palette.mint, 0.88);
        g.strokeRoundedRect(x - 15, y - 12, 30, 24, 3);
        for (let t = -8; t <= 8; t += 8) {
          g.lineBetween(x + t - 2, y - 11, x + t + 3, y - 7);
          g.lineBetween(x + t - 2, y + 8, x + t + 3, y + 12);
        }
      } else if (effect.kind === 'tidied') {
        // A little neat sweep and sparkling cleared grass.
        g.lineStyle(2, palette.mint, 0.9);
        g.lineBetween(x - 13, y + 6, x + 12, y + 6);
        g.lineBetween(x - 9, y + 11, x + 8, y + 11);
        g.lineBetween(x - 11, y + 3, x - 11, y - 5);
        g.lineBetween(x - 15, y - 1, x - 7, y - 1);
        g.fillStyle(0xe2dab7, 0.93);
        g.fillCircle(x + 12, y - 6, 2.5);
      } else if (effect.kind === 'heritage') {
        // A small restored iron/plaque miniature beside the street.
        g.lineStyle(1.5, palette.chalk, 0.85);
        g.strokeRect(x - 12, y - 14, 24, 22);
        g.lineBetween(x - 8, y - 8, x + 8, y - 8);
        g.lineBetween(x - 8, y - 2, x + 4, y - 2);
        g.lineBetween(x, y + 8, x, y + 15);
        g.strokeCircle(x, y + 16, 2.5);
        g.fillStyle(palette.gold, 0.7);
        g.fillCircle(x + 7, y + 3, 3);
      } else if (effect.kind === 'display') {
        // A heritage display/notice board drawing cars toward it.
        g.fillStyle(0x5b6355, 0.58);
        g.fillRoundedRect(x - 14, y - 13, 28, 22, 2);
        g.lineStyle(2, palette.gold, 0.92);
        g.strokeRoundedRect(x - 14, y - 13, 28, 22, 2);
        g.lineBetween(x - 9, y - 6, x + 9, y - 6);
        g.lineBetween(x - 9, y + 1, x + 6, y + 1);
        g.lineBetween(x - 9, y + 9, x - 9, y + 16);
        g.lineBetween(x + 9, y + 9, x + 9, y + 16);
      } else if (effect.kind === 'sketch') {
        // The Bells have left a small framed, pencil-drawn streetscape.
        g.fillStyle(0x343c35, 0.85);
        g.fillRoundedRect(x - 13, y - 14, 26, 25, 2);
        g.lineStyle(2.1, palette.gold, 0.88);
        g.strokeRoundedRect(x - 13, y - 14, 26, 25, 2);
        g.lineStyle(1.2, palette.chalk, 0.9);
        g.lineBetween(x - 8, y + 4, x - 2, y - 4);
        g.lineBetween(x - 2, y - 4, x + 5, y + 1);
        g.lineBetween(x + 5, y + 1, x + 9, y - 6);
        g.strokeCircle(x - 6, y - 7, 2);
        g.lineBetween(x, y + 11, x, y + 16);
      } else if (effect.kind === 'guidance') {
        // The Wards leave a small, temporary safe-way marker.
        g.lineStyle(2, palette.mint, 0.94);
        g.lineBetween(x - 12, y + 2, x + 12, y + 2);
        g.lineBetween(x + 12, y + 2, x + 5, y - 6);
        g.lineBetween(x + 12, y + 2, x + 5, y + 10);
        g.strokeCircle(x - 8, y - 7, 4);
      }
    }
    // Tiny hand-drawn props make the activity physically visible throughout
    // setup, the main event and packing away; never a second floating HUD.
    for (const activity of store.activities.active) this.drawActivity(g, activity);
    for (const incident of store.accidents.active) {
      const point=worldPoint(incident.road);
      const target=worldPoint(incident.model);
      g.fillStyle(palette.danger,.18);
      g.fillCircle(point.x,point.y,15);
      g.lineStyle(1.7,palette.gold,.85);
      g.strokeTriangle(point.x-11,point.y+9,point.x+11,point.y+9,point.x,point.y-12);
      g.lineBetween(point.x,point.y-5,point.x,point.y+2);
      g.fillCircle(point.x,point.y+5,1.5);
      g.lineStyle(1.3,palette.danger,.7);
      g.lineBetween(point.x,point.y,target.x,target.y);
      g.strokeCircle(target.x,target.y,18);
    }
    this.syncActivityLabels();
  }

  private drawActivity(g: Phaser.GameObjects.Graphics, activity: ActiveActivity): void {
    const { x, y } = worldPoint(activity.cell);
    const preparing = activity.phase === 'setting-up';
    const packing = activity.phase === 'packing-up';
    const social = activity.kind === 'picnic' || activity.kind === 'gathering';
    const meal = social || activity.kind === 'working-lunch';
    g.fillStyle(0x39483b, .27);
    g.fillRoundedRect(x - 17, y - 13, 34, 27, 4);
    g.lineStyle(1, palette.chalk, .42);
    g.strokeRoundedRect(x - 17, y - 13, 34, 27, 4);
    if (social) {
      // Checked picnic blanket with a basket and two small place settings.
      g.fillStyle(0x829c82, .45);
      g.fillRoundedRect(x - 14, y - 9, 28, 19, 2);
      g.lineStyle(1, palette.gold, .7);
      for (let d = -8; d <= 8; d += 8) {
        g.lineBetween(x + d, y - 9, x + d, y + 10);
      }
      g.fillStyle(0xb9a47d, .93);
      g.fillRoundedRect(x - 2, y - 7, 12, 9, 2);
      g.lineStyle(1.3, palette.chalk, .95);
      g.strokeCircle(x + 4, y - 6, 4);
      if (!preparing && !packing) {
        for (const dx of [-9, 11]) {
          g.fillStyle(0xd9d9cd, .95);
          g.fillCircle(x + dx, y + 5, 3.2);
        }
      }
      if (activity.kind === 'gathering') {
        g.lineStyle(2, palette.gold, .9);
        g.lineBetween(x - 13, y - 15, x - 8, y - 20);
        g.lineBetween(x + 13, y - 15, x + 8, y - 20);
      }
    } else if (activity.kind === 'delivery') {
      // Delivery crates are stacked, then carried away one at a time.
      g.fillStyle(0x947f64, .85);
      g.fillRect(x - 13, y - 8, 13, 14);
      if (!packing) g.fillRect(x + 2, y - 3, 12, 11);
      g.lineStyle(1.3, palette.chalk, .8);
      g.strokeRect(x - 13, y - 8, 13, 14);
      if (!packing) g.strokeRect(x + 2, y - 3, 12, 11);
      g.lineBetween(x - 13, y - 8, x, y + 6);
    } else if (activity.kind === 'sketch') {
      // A tiny easel, paper and a pencil.
      g.lineStyle(1.6, palette.chalk, .95);
      g.lineBetween(x, y - 9, x - 9, y + 14);
      g.lineBetween(x, y - 9, x + 9, y + 14);
      g.strokeRect(x - 10, y - 11, 20, 17);
      g.lineBetween(x - 6, y + 1, x, y - 6);
      g.lineBetween(x, y - 6, x + 5, y - 1);
    } else if (activity.kind === 'heritage-visit') {
      g.lineStyle(2, palette.gold, .9);
      g.strokeRect(x - 10, y - 12, 20, 21);
      g.lineStyle(1, palette.chalk, .85);
      g.lineBetween(x - 7, y - 5, x + 7, y - 5);
      g.lineBetween(x - 7, y + 1, x + 4, y + 1);
      g.lineBetween(x + 11, y + 8, x + 16, y + 14);
    } else if (activity.kind === 'safety-round') {
      g.lineStyle(1.6, palette.mint, .93);
      g.strokeCircle(x, y - 3, 8);
      g.lineBetween(x - 12, y + 10, x + 12, y + 10);
      g.lineBetween(x + 12, y + 10, x + 6, y + 4);
      g.strokeCircle(x, y - 3, 3);
    } else if (activity.kind === 'explore') {
      g.lineStyle(1.4, palette.gold, .86);
      g.strokeRoundedRect(x - 11, y - 11, 22, 23, 2);
      g.lineBetween(x - 7, y - 6, x - 1, y + 2);
      g.lineBetween(x - 1, y + 2, x + 8, y - 5);
      g.strokeCircle(x - 7, y - 6, 2);
      g.strokeCircle(x + 8, y - 5, 2);
    } else if (meal) {
      g.fillStyle(0xbca989, .9);
      g.fillRoundedRect(x - 11, y - 7, 22, 15, 3);
      g.lineStyle(1.2, palette.chalk, .93);
      g.strokeRoundedRect(x - 11, y - 7, 22, 15, 3);
      g.strokeCircle(x, y, 5);
      g.lineBetween(x + 9, y - 9, x + 13, y - 12);
    }
    // The small dotted phase indicator shows work in progress without
    // relying on text or colour alone.
    const dots = activity.phase === 'setting-up' ? 1 :
      activity.phase === 'underway' ? 2 : 3;
    for (let i = 0; i < dots; i++) {
      g.fillStyle(palette.gold, .95);
      g.fillCircle(x - 5 + i * 5, y + 19, 1.8);
    }
  }

  private syncActivityLabels(): void {
    const active = new Set(store.activities.active.map(activity => activity.id));
    for (const [id, label] of this.activityLabels) {
      if (active.has(id)) continue;
      label.destroy();
      this.activityLabels.delete(id);
    }
    for (const activity of store.activities.active) {
      const name = activity.kind.replace(/-/g, ' ').toUpperCase();
      const stage = activity.phase === 'setting-up' ? 'ARRIVING' :
        activity.phase === 'underway' ? 'UNDERWAY' : 'PACKING';
      const point = worldPoint(activity.cell);
      const label = this.activityLabels.get(activity.id) ??
        this.add.text(point.x, point.y - 29, '', {
          fontFamily: 'Georgia, serif', fontSize: '9px', color: '#e7d9bc',
          backgroundColor: '#1a231e', padding: {x: 4, y: 2}
        }).setOrigin(.5).setDepth(18);
      label.setText(name + ' · ' + stage);
      this.activityLabels.set(activity.id, label);
    }
  }

  /** A response happens where a car genuinely passes, without creating
   * a new floating permanent HUD element or an unbounded particle system. */
  private animateNeighbourResponse(note: NeighbourNote): void {
    const pos=worldPoint(note.cell);
    const label=note.kind==='hale-restore'?'A REPAIR' :
      note.kind==='ward-visit'?'A SAFER CORNER' :
        note.kind==='marsh-clean'?'TIDIED UP':'A KIND WORD';
    const pulse=this.add.circle(pos.x,pos.y,10,palette.mint,.08)
      .setStrokeStyle(1.8,palette.mint,.88).setDepth(33);
    const text=this.add.text(pos.x,pos.y-29,label,{
      fontFamily:'Georgia, serif',fontSize:'9px',color:'#c3dfbb',
      backgroundColor:'#1a231e',padding:{x:4,y:2}
    }).setOrigin(.5).setDepth(40);
    if(this.reduceMotion()){
      this.time.delayedCall(650,()=>{pulse.destroy();text.destroy();});
    }else{
      this.tweens.add({targets:pulse,scale:2.1,alpha:0,duration:760,
        onComplete:()=>pulse.destroy()});
      this.tweens.add({targets:text,y:text.y-8,alpha:0,delay:450,
        duration:730,onComplete:()=>text.destroy()});
    }
  }

  private animateRoadsideImpact(event: RoadsideIncident): void {
    const impact=worldPoint(event.model);
    const ripple=this.add.circle(impact.x,impact.y,8,palette.danger,.15)
      .setStrokeStyle(2,palette.danger,.96).setDepth(32);
    if(this.reduceMotion()){
      this.time.delayedCall(750,()=>ripple.destroy());
    }else{
      this.tweens.add({targets:ripple,scale:3.2,alpha:0,duration:750,
        onComplete:()=>ripple.destroy()});
    }
    const label=this.add.text(impact.x,impact.y-32,
      event.after==='broken'?'BROKEN':'DAMAGED',{
        fontFamily:'Georgia, serif',fontSize:'10px',color:'#f2c0ad',
        backgroundColor:'#19221b',padding:{x:4,y:3}
      }).setOrigin(.5).setDepth(45);
    if(this.reduceMotion())this.time.delayedCall(850,()=>label.destroy());
    else this.tweens.add({targets:label,alpha:0,y:label.y-12,delay:550,duration:900,
      onComplete:()=>label.destroy()});
  }

  private animateEnvironmentEvent(event: EnvironmentalEvent): void {
    const point = worldPoint(event.cell);
    const helpful = event.tone === 'helpful';
    const ripple = this.add.circle(point.x, point.y, 7,
      helpful ? palette.mint : palette.gold, 0.12)
      .setStrokeStyle(1.8, helpful ? palette.mint : palette.gold, 0.82)
      .setDepth(25);
    if (this.reduceMotion()) {
      this.time.delayedCall(700, () => ripple.destroy());
    } else {
      this.tweens.add({
        targets: ripple, scale: 2.9, alpha: 0, duration: 900,
        ease: 'Sine.Out', onComplete: () => ripple.destroy()
      });
    }
    if (event.outcome === 'captured' || event.outcome === 'overflow') {
      const mark = this.add.text(point.x,point.y-20,
        event.outcome === 'captured' ? '+1 IN BIN' : 'BIN FULL', {
          fontFamily:'Georgia, serif',fontSize:'10px',
          color:event.outcome === 'captured'?'#c3dfbb':'#e5af9e',
          backgroundColor:'#131c16',padding:{x:4,y:3}
        }).setOrigin(0.5).setDepth(46);
      if (this.reduceMotion()) {
        this.time.delayedCall(850,()=>mark.destroy());
      } else {
        this.tweens.add({targets:mark,alpha:0,y:mark.y-13,delay:450,
          duration:700,onComplete:()=>mark.destroy()});
      }
    }
  }

  private drawDynamic(): void {
    if (!this.modelLayer) return;
    this.drawEnvironment();
    this.modelLayer.clear();
    this.homeLayer.clear();
    this.influenceLayer.clear();
    this.highlightLayer.clear();
    this.ghostLayer.clear();
    this.kitGhost.setVisible(false);
    this.syncKitSprites();

    store.placements.forEach((placed) => {
      const point = worldPoint(placed);
      const condition=modelCondition(placed.condition);
      if (condition!=='intact') {
        if(condition==='broken'){
          // Darken the once-functional object and scatter a few actual shards.
          this.modelLayer.fillStyle(0x101815,.6);
          this.modelLayer.fillRoundedRect(point.x-19,point.y-29,38,47,2);
          this.modelLayer.lineStyle(2.1,palette.danger,.92);
          this.modelLayer.lineBetween(point.x-14,point.y-4,point.x+12,point.y+9);
          this.modelLayer.lineBetween(point.x-9,point.y+12,point.x+5,point.y-11);
          this.modelLayer.lineBetween(point.x-16,point.y+17,point.x-8,point.y+11);
          this.modelLayer.lineBetween(point.x+6,point.y+16,point.x+16,point.y+13);
        }else{
          // A distinctive pencil crack, rather than confusing wear with care.
          this.modelLayer.lineStyle(1.9,palette.gold,.94);
          this.modelLayer.lineBetween(point.x-10,point.y-16,point.x-1,point.y-7);
          this.modelLayer.lineBetween(point.x-1,point.y-7,point.x-6,point.y+2);
          this.modelLayer.lineBetween(point.x-6,point.y+2,point.x+8,point.y+10);
        }
        this.modelLayer.fillStyle(condition==='broken'?palette.danger:palette.gold,.93);
        this.modelLayer.fillCircle(point.x+17,point.y-21,6);
        this.modelLayer.lineStyle(1.1,0x131c16,1);
        this.modelLayer.lineBetween(point.x+17,point.y-24,point.x+17,point.y-20);
        this.modelLayer.fillCircle(point.x+17,point.y-18,1);
      }
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
      this.kitGhost.setTexture(miniatureTextureKey(store.activeModel!))
        .setPosition(point.x, point.y - 7)
        .setAlpha(preview.allowed ? 0.78 : 0.35)
        .setVisible(true);
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
    if (this.reduceMotion()) {
      this.time.delayedCall(1700,()=>bubble.destroy());
    } else {
      this.tweens.add({
        targets: bubble, y: bubble.y - 16, alpha: 0,
        delay: 1150, duration: 1200, ease: 'Sine.Out',
        onComplete: () => bubble.destroy()
      });
    }
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
    if (this.reduceMotion()) {
      this.time.delayedCall(850,()=>bubble.destroy());
    } else {
      this.tweens.add({
        targets: bubble, y: y - 43, alpha: 0, duration: 1700,
        ease: 'Cubic.Out', onComplete: () => bubble.destroy()
      });
    }
  }

  /**
   * Developer-only helper and integration-test hook. Uses the *real* car's
   * position rather than spawning a roadside marker in a disconnected tile.
   */
  forceTrafficStop(residentId: number, duration = 4.2): boolean {
    const car = this.cars.find(item => item.residentId === residentId);
    if (!car || car.cycle.phase !== 'driving') return false;
    const index = Math.floor((
      car.startIndex * BOARD.tile + car.cycle.distance
    ) % (ROAD_CELLS.length * BOARD.tile) / BOARD.tile);
    return store.debugTrafficStop(residentId, ROAD_CELLS[index], duration);
  }

  trafficSnapshot() {
    const length = ROAD_CELLS.length * BOARD.tile;
    return this.cars.filter(car => store.residents[car.residentId]?.occupied)
      .map(car => ({
        residentId: car.residentId,
        phase: car.cycle.phase,
        position: (car.startIndex * BOARD.tile + car.cycle.distance) % length,
        speed: car.speed * car.speedFactor * bendSpeedMultiplier(
          car.startIndex * BOARD.tile + car.cycle.distance, car.driver),
        cruiseSpeed: car.driver.cruiseSpeed,
        headwaySeconds: car.driver.headwaySeconds,
        travelled: car.cycle.distance,
        lane: car.lane,
        changingTo: car.changingTo,
        laneOffset: car.laneOffset,
        parkedForActivity: car.parkedForActivity,
        activity: store.activities.forResident(car.residentId)?.kind ?? null,
        x: car.container.x,
        y: car.container.y,
        visible: car.container.visible
      }));
  }

  update(_time: number, delta: number): void {
    if (store.paused || store.workshopOpen || store.phase !== 'playing') return;
    const length = ROAD_CELLS.length;
    const totalDistance = length * BOARD.tile;
    const dt = Math.min(delta, 60) / 1000 * store.gameSpeed;
    store.tickEconomy(dt);

    // Physical following, passing and reserved driveways use the same vehicles.
    // A little roadside display or loose packaging can obstruct the road edge.
    const vergeObstructions = store.environment.effects
      .filter(effect => effect.kind === 'display' || effect.kind === 'litter')
      .map(effect => effect.cell);
    const vehicles: RoadVehicle[] = [];
    for (const car of this.cars) {
      if (!store.residents[car.residentId]?.occupied) continue;
      const position = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
      if (car.cycle.phase === 'driving' &&
        (car.parkedForActivity || store.activities.forResident(car.residentId))) {
        // A family taking part in an activity is OFF the road; keeping a
        // stopped car in the traffic solver would manufacture a false queue.
        continue;
      }
      if (car.cycle.phase === 'driving') {
        const index = Math.min(length - 1, Math.floor(position / BOARD.tile));
        const sign = store.speedMultiplierAt(ROAD_CELLS[index]);
        car.speedFactor += (sign - car.speedFactor) * Math.min(1, dt * 7);
        vehicles.push({
          residentId: car.residentId, position,
          desiredSpeed: store.traffic.shouldStop(car.residentId) ||
            (car.lane === 'passing' &&
              passingLaneBlockedAhead(position, vergeObstructions, 30))
            ? 0 : car.speed * car.speedFactor * bendSpeedMultiplier(position, car.driver)
              * store.driverCautionFactor(car.residentId),
          lane: car.lane, changingTo: car.changingTo, driver: car.driver
        });
      } else if (car.cycle.phase === 'departing') {
        vehicles.push({
          residentId: car.residentId, position: car.startIndex * BOARD.tile,
          desiredSpeed: 0, lane: 'left', drivewayReservation: true
        });
      }
    }

    const grantedDepartures = new Set<number>();
    for (const car of this.cars) {
      if (!store.residents[car.residentId]?.occupied ||
        car.cycle.phase !== 'at-home' ||
        car.cycle.timer + dt < HOME_DWELL_SECONDS) continue;
      const position = car.startIndex * BOARD.tile;
      if (!canReserveRoad(position, vehicles, totalDistance)) continue;
      grantedDepartures.add(car.residentId);
      vehicles.push({ residentId: car.residentId, position, desiredSpeed: 0,
        lane: 'left', drivewayReservation: true });
    }

    // At the end of an activity, a parked driver may ONLY rejoin when there
    // is a safe gap in both directions. No jump into a passing vehicle.
    for (const car of this.cars) {
      if (!car.parkedForActivity || store.activities.forResident(car.residentId) ||
        !store.residents[car.residentId]?.occupied || car.cycle.phase !== 'driving') continue;
      const position = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
      if (!canReserveRoad(position, vehicles, totalDistance)) continue;
      car.parkedForActivity = false;
      car.parkingCell = null;
      car.lane = 'left';
      car.changingTo = null;
      car.laneChangeElapsed = 0;
      car.laneOffset = TRAFFIC_LEFT_LANE_OFFSET;
      vehicles.push({ residentId: car.residentId, position, desiredSpeed: 0,
        lane: 'left', drivewayReservation: true, driver: car.driver });
    }

    // Reserve each requested lane change before advancing any vehicle.
    // Changing cars occupy *both* lanes so neither a passing nor a following
    // vehicle can cross their path. Cars waiting for a clear lane simply queue.
    const laneChanges = planLaneChanges(vehicles, totalDistance, vergeObstructions);
    for (const car of this.cars) {
      const target = laneChanges.get(car.residentId);
      if (!target || car.changingTo || car.cycle.phase !== 'driving') continue;
      car.changingTo = target;
      car.laneChangeElapsed = 0;
      const vehicle = vehicles.find(item => item.residentId === car.residentId);
      if (vehicle) vehicle.changingTo = target;
    }
    const movements = advanceTraffic(vehicles, dt, totalDistance);
    const byResident = new Map(movements.map(move => [move.residentId, move]));
    const queued: Array<{ residentId: number; cell: Cell; delaySeconds: number }> = [];

    for (const car of this.cars) {
      const resident = store.residents[car.residentId];
      if (!resident?.occupied) {
        car.container.setVisible(false);
        car.homeBadge.setVisible(false);
        car.brakeLights.setVisible(false);
        continue;
      }

      const homePoint = worldPoint(HOMES[car.residentId]);
      const roadPoint = roadPoseAt(car.startIndex * BOARD.tile, car.laneOffset);
      const activeActivity = store.activities.forResident(car.residentId);
      if (activeActivity) {
        car.parkedForActivity = true;
        car.parkingCell = activeActivity.cell;
        car.lane = 'left';
        car.changingTo = null;
        car.laneChangeElapsed = 0;
        car.laneOffset = TRAFFIC_LEFT_LANE_OFFSET;
      }
      if (car.parkedForActivity && car.cycle.phase === 'driving') {
        // Pull over between the road and the activity props. A driver may
        // wait here a little longer after packing up for a safe re-entry.
        const parked = worldPoint(car.parkingCell ?? activeActivity!.cell);
        const roadPosition = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
        const road = roadPoseAt(roadPosition);
        car.container.setPosition(
          road.x + (parked.x - road.x) * .48,
          road.y + (parked.y - road.y) * .48
        ).setRotation(road.rotation).setVisible(true);
        car.homeBadge.setVisible(false);
        car.brakeLights.setVisible(false);
        continue;
      }
      const movingBefore = car.cycle.phase === 'driving';
      const movement = byResident.get(car.residentId);
      if (movingBefore) {
        const completed = stepCarCycle(car.cycle, dt, movement?.distance ?? 0, totalDistance);
        if (completed) {
          const earned = store.finishLap(car.residentId);
          this.showLapCoins(car, earned);
          car.tileIndex = -1;
        } else if (movement?.queued && movement.delaySeconds > 0) {
          const position = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
          const index = Math.min(length - 1, Math.floor(position / BOARD.tile));
          queued.push({
            residentId: car.residentId,
            cell: ROAD_CELLS[index],
            delaySeconds: movement.delaySeconds
          });
        }
      } else {
        stepCarCycle(car.cycle, dt, 0, totalDistance,
          grantedDepartures.has(car.residentId));
      }

      car.container.setVisible(true);
      car.homeBadge.setVisible(car.cycle.phase === 'at-home');
      car.brakeLights.setVisible(movingBefore && (
        store.traffic.shouldStop(car.residentId) || !!movement?.queued
      ));

      if (car.cycle.phase === 'driving') {
        const distance = (car.startIndex * BOARD.tile + car.cycle.distance) % totalDistance;
        const index = Math.min(length - 1, Math.floor(distance / BOARD.tile));
        let reaction: JourneyReaction | null = null;
        if (index !== car.tileIndex) {
          car.tileIndex = index;
          reaction = store.passTile(car.residentId, ROAD_CELLS[index],
            car.lane === 'left' && !car.changingTo);
          const incident=store.considerRoadsideAccident(car.residentId,ROAD_CELLS[index],
            movement?.speed??0,car.lane,!!car.changingTo);
          if(incident){
            car.brakeLights.setVisible(true);
            this.showCarThought(car,{
              residentId:car.residentId,calmer:false,
              text:incident.after==='broken'
                ? 'Oh! I have broken that little roadside model.'
                : 'I have clipped something beside the road.'
            });
          }
        }
        if (car.changingTo) {
          car.laneChangeElapsed += dt;
          const proportion = Math.min(1, car.laneChangeElapsed / TRAFFIC_LANE_CHANGE_SECONDS);
          const eased = proportion * proportion * (3 - 2 * proportion);
          const from = car.lane === 'left'
            ? TRAFFIC_LEFT_LANE_OFFSET : TRAFFIC_PASSING_LANE_OFFSET;
          const to = car.changingTo === 'left'
            ? TRAFFIC_LEFT_LANE_OFFSET : TRAFFIC_PASSING_LANE_OFFSET;
          car.laneOffset = from + (to - from) * eased;
          if (proportion >= 1) {
            car.lane = car.changingTo;
            car.changingTo = null;
            car.laneChangeElapsed = 0;
          }
        } else {
          const preferred = car.lane === 'passing' ? TRAFFIC_PASSING_LANE_OFFSET
            : preferredRoadLaneOffset(distance, vergeObstructions);
          // An obstruction can produce a small smooth inward movement, but
          // never shift toward another car occupying the passing lane.
          const nearbyPassing = vehicles.some(other =>
            other.residentId !== car.residentId &&
            (other.lane === 'passing' || other.changingTo === 'passing') &&
            Math.min((other.position - distance + totalDistance) % totalDistance,
              (distance - other.position + totalDistance) % totalDistance) < 90);
          const safeOffset = car.lane === 'left' && nearbyPassing
            ? TRAFFIC_LEFT_LANE_OFFSET : preferred;
          car.laneOffset += (safeOffset - car.laneOffset) * Math.min(1, dt * 6);
        }
        const pose = roadPoseAt(distance, car.laneOffset);
        car.container.setPosition(pose.x, pose.y);
        car.container.setRotation(pose.rotation);
        if (reaction) this.showCarThought(car, reaction);
      } else {
        if (car.cycle.phase === 'at-home') {
          // Each new journey begins driving on the left.
          car.lane = 'left';
          car.changingTo = null;
          car.laneChangeElapsed = 0;
          car.laneOffset = TRAFFIC_LEFT_LANE_OFFSET;
        }
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
    }

    store.reportTrafficFlow(queued);
    this.trafficLayer.clear();
    const stop = store.traffic.activeStop;
    if (stop) {
      const culprit = this.cars.find(car => car.residentId === stop.residentId);
      if (culprit && culprit.cycle.phase === 'driving') {
        const x = culprit.container.x, y = culprit.container.y;
        this.trafficLayer.lineStyle(1.7, palette.gold, 0.85);
        this.trafficLayer.strokeCircle(x, y, 20);
        this.trafficLabel.setText(stop.kind === 'admiring' ? 'A MOMENT...' :
          stop.kind === 'chatting' ? 'A CHAT...' : 'CAREFUL...')
          .setPosition(x, y - 36).setVisible(true);
      } else {
        this.trafficLabel.setVisible(false);
      }
      if (stop.id !== this.lastStopId) {
        this.lastStopId = stop.id;
        const spot = worldPoint(stop.cell);
        const pulse = this.add.circle(spot.x, spot.y, 9, palette.gold, 0.11)
          .setStrokeStyle(1.8, palette.gold, 0.78).setDepth(24);
        if (this.reduceMotion()) {
          this.time.delayedCall(650,()=>pulse.destroy());
        } else {
          this.tweens.add({
            targets:pulse, scale:2.8, alpha:0, duration:800,
            onComplete:() => pulse.destroy()
          });
        }
      }
    } else {
      this.trafficLabel.setVisible(false);
    }
    // Small chalk-style congestion rings on actual queueing vehicles.
    for (const waiting of queued) {
      const car = this.cars.find(item => item.residentId === waiting.residentId);
      if (!car) continue;
      this.trafficLayer.lineStyle(1, palette.danger, 0.62);
      this.trafficLayer.strokeEllipse(car.container.x, car.container.y, 40, 30);
    }
  }
}
