import { describe, it, expect } from "vitest";
import { mulberry32, Rng, hashString } from "../core/rng";

describe("mulberry32", () => {
  it("deterministic: same seed produces same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
  it("values are in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("Rng", () => {
  it("int bounds", () => {
    const r = new Rng(99);
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
  it("pick from array", () => {
    const r = new Rng(42);
    const arr = [10, 20, 30];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
  });
  it("shuffle preserves elements", () => {
    const r = new Rng(55);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = r.shuffle(arr);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("chance respects probability", () => {
    const r = new Rng(33);
    let trues = 0;
    for (let i = 0; i < 1000; i++) { if (r.chance(0.5)) trues++; }
    expect(trues).toBeGreaterThan(400);
    expect(trues).toBeLessThan(600);
  });
});

describe("hashString", () => {
  it("same input same output", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });
  it("different inputs different outputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
  it("non-zero", () => {
    expect(hashString("test")).toBeGreaterThan(0);
  });
});