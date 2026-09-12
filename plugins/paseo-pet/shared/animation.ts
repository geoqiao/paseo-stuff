import { CELL_HEIGHT, CELL_WIDTH, COLUMNS, type SpriteVersion } from "./contracts";

export const animations = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  right: { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  left: { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
} as const;
export type Animation = keyof typeof animations;

export function frameAt(animation: Animation, elapsed: number): { column: number; remaining: number } {
  const times = animations[animation].durations;
  const duration = times.reduce<number>((sum, ms) => sum + ms, 0);
  let time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) % duration;
  for (let column = 0; column < times.length; column++) {
    if (time < times[column]) return { column, remaining: times[column] - time };
    time -= times[column];
  }
  return { column: 0, remaining: times[0] };
}
export function spriteGeometry(version: SpriteVersion, animation: Animation, column: number, width = CELL_WIDTH) {
  const scale = width / CELL_WIDTH;
  const safeColumn = Math.max(0, Math.min(Math.trunc(column) || 0, animations[animation].durations.length - 1));
  return {
    width, height: CELL_HEIGHT * scale,
    atlasWidth: COLUMNS * CELL_WIDTH * scale,
    atlasHeight: (version === 2 ? 11 : 9) * CELL_HEIGHT * scale,
    left: -safeColumn * CELL_WIDTH * scale,
    top: -animations[animation].row * CELL_HEIGHT * scale,
  };
}
