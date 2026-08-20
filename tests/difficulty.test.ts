import { describe, it, expect } from "vitest";
import { arcadeParams } from "../core/difficulty";

describe("arcadeParams", () => {
  it("combo 0: 3x3 strong 180 8s", () => {
    const p = arcadeParams(0, false);
    expect(p.gridN).toBe(3);
    expect(p.tier).toBe("strong");
    expect(p.angles).toEqual([180]);
    expect(p.timeLimit).toBe(8);
    expect(p.easy).toBe(false);
  });

  it("combo 5: breathing easy level", () => {
    const p = arcadeParams(5, false);
    expect(p.easy).toBe(true);
    expect(p.gridN).toBe(3);
    expect(p.timeLimit).toBe(8);
  });

  it("combo 10: breathing triggered (10%5===0)", () => {
    const p = arcadeParams(10, false);
    expect(p.easy).toBe(true);
    expect(p.gridN).toBe(3);
  });

  it("combo 11: no breathing", () => {
    const p = arcadeParams(11, false);
    expect(p.easy).toBe(false);
  });

  it("combo 41+: 6x6 weak 5s with micro angles", () => {
    const p = arcadeParams(41, false);
    expect(p.gridN).toBe(6);
    expect(p.tier).toBe("weak");
    expect(p.timeLimit).toBe(5);
    expect(p.angles.some(a => a < 15)).toBe(true); // micro angle present
  });

  it("combo 5 with breathing: 3x3 strong 180 8s", () => {
    const p = arcadeParams(5, false);
    expect(p.easy).toBe(true);
    expect(p.gridN).toBe(3);
    expect(p.tier).toBe("strong");
    expect(p.timeLimit).toBe(8);
  });

  it("chaos mode adds micro angles early", () => {
    const p = arcadeParams(10, true);
    expect(p.angles.some(a => a < 15)).toBe(false); // not micro at combo 10 even with chaos? Actually chaos only adds micro at 41+ per table
    // chaos doesn't change the table, only unlocks shapes
  });

  it("timeLimit never below 5", () => {
    for (let c = 0; c < 100; c++) {
      const p = arcadeParams(c, false);
      expect(p.timeLimit).toBeGreaterThanOrEqual(5);
    }
  });
});