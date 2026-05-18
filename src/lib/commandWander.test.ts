import { describe, expect, it } from "vitest";

import {
  easedPosition,
  initialSchedule,
  pickFacing,
  planWanderMove,
  scheduleNextPick,
  WANDER,
  type WanderInProgress,
} from "./commandWander";

function seededRng(seed: number): () => number {
  // Mulberry32 — deterministic for tests.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("pickFacing", () => {
  it("returns null for zero-length vectors", () => {
    expect(pickFacing(0, 0)).toBeNull();
  });

  it("east is +x", () => {
    expect(pickFacing(10, 0)).toBe("E");
  });

  it("north is -y (screen coords)", () => {
    expect(pickFacing(0, -10)).toBe("N");
  });

  it("south is +y", () => {
    expect(pickFacing(0, 10)).toBe("S");
  });

  it("west is -x", () => {
    expect(pickFacing(-10, 0)).toBe("W");
  });

  it("north-east is up-right in screen coords", () => {
    expect(pickFacing(10, -10)).toBe("NE");
  });

  it("south-west is down-left", () => {
    expect(pickFacing(-10, 10)).toBe("SW");
  });

  it("snaps to nearest sector at ±22.5° boundary", () => {
    // tan(22.5°) * 10 ≈ 4.14. Just below the boundary stays E;
    // beyond it crosses into NE.
    expect(pickFacing(10, -4)).toBe("E");
    expect(pickFacing(10, -5)).toBe("NE");
  });
});

describe("easedPosition", () => {
  const active: WanderInProgress = {
    startedAtMs: 1000,
    durationMs: 2000,
    fromX: 0,
    fromY: 0,
    toX: 100,
    toY: 0,
    facing: "E",
  };

  it("starts at fromX/fromY", () => {
    const r = easedPosition(active, 1000);
    expect(r.x).toBe(0);
    expect(r.done).toBe(false);
  });

  it("ends at toX/toY and reports done", () => {
    const r = easedPosition(active, 3000);
    expect(r.x).toBe(100);
    expect(r.done).toBe(true);
  });

  it("clamps before start (negative elapsed)", () => {
    const r = easedPosition(active, 500);
    expect(r.x).toBe(0);
  });

  it("smoothsteps at midpoint", () => {
    const r = easedPosition(active, 2000);
    // t=0.5; smoothstep(0.5) = 0.5; midpoint is exactly halfway.
    expect(r.x).toBeCloseTo(50, 6);
  });
});

describe("planWanderMove", () => {
  it("returns a move within anchor radius", () => {
    const rng = seededRng(42);
    const move = planWanderMove({
      anchorX: 100,
      anchorY: 100,
      currentX: 100,
      currentY: 100,
      others: [],
      rng,
      nowMs: 0,
    });
    expect(move).not.toBeNull();
    if (!move) return;
    const dist = Math.hypot(move.toX - 100, move.toY - 100);
    expect(dist).toBeLessThanOrEqual(WANDER.anchorRadius + 0.001);
  });

  it("respects move distance bounds", () => {
    const rng = seededRng(7);
    const move = planWanderMove({
      anchorX: 0,
      anchorY: 0,
      currentX: 0,
      currentY: 0,
      others: [],
      rng,
      nowMs: 0,
    });
    expect(move).not.toBeNull();
    if (!move) return;
    const stepDist = Math.hypot(move.toX - move.fromX, move.toY - move.fromY);
    expect(stepDist).toBeGreaterThanOrEqual(WANDER.moveDistMin - 0.001);
    // Clamping to anchor radius can shorten a step, never lengthen it.
    expect(stepDist).toBeLessThanOrEqual(WANDER.moveDistMax + 0.001);
  });

  it("avoids placing the destination inside another unit's separation radius", () => {
    const rng = seededRng(123);
    // Surround the unit with neighbours on a tight ring so any move
    // direction would collide. Engine should give up and return null.
    const others = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      others.push({
        x: Math.cos(a) * 10,
        y: Math.sin(a) * 10,
      });
    }
    const move = planWanderMove({
      anchorX: 0,
      anchorY: 0,
      currentX: 0,
      currentY: 0,
      others,
      rng,
      nowMs: 0,
    });
    expect(move).toBeNull();
  });

  it("biases back toward anchor when near the edge", () => {
    const rng = seededRng(9);
    // Place the unit near the east edge of its anchor radius. Over
    // many picks, the average heading should be westward.
    let sumDx = 0;
    let count = 0;
    for (let i = 0; i < 20; i++) {
      const move = planWanderMove({
        anchorX: 0,
        anchorY: 0,
        currentX: WANDER.anchorRadius * 0.85,
        currentY: 0,
        others: [],
        rng,
        nowMs: 0,
      });
      if (!move) continue;
      sumDx += move.toX - move.fromX;
      count += 1;
    }
    expect(count).toBeGreaterThan(10);
    // Average dx should be negative (westward).
    expect(sumDx / count).toBeLessThan(0);
  });

  it("sets a facing matching the step direction", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 5; i++) {
      const move = planWanderMove({
        anchorX: 0,
        anchorY: 0,
        currentX: 0,
        currentY: 0,
        others: [],
        rng,
        nowMs: 0,
      });
      if (!move) continue;
      const expected = pickFacing(move.toX - move.fromX, move.toY - move.fromY);
      expect(move.facing).toBe(expected);
    }
  });
});

describe("scheduleNextPick", () => {
  it("returns a time within the configured interval", () => {
    const rng = seededRng(1);
    const t = scheduleNextPick(1000, rng);
    expect(t).toBeGreaterThanOrEqual(1000 + WANDER.pickIntervalMinMs);
    expect(t).toBeLessThanOrEqual(1000 + WANDER.pickIntervalMaxMs);
  });
});

describe("initialSchedule", () => {
  it("returns a short delay before the first pick (2-8s)", () => {
    const rng = seededRng(2);
    const s = initialSchedule(0, rng);
    expect(s.active).toBeNull();
    expect(s.nextPickAtMs).toBeGreaterThanOrEqual(2000);
    expect(s.nextPickAtMs).toBeLessThanOrEqual(8000);
  });
});
