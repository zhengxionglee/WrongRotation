export type GridType = "square" | "hex" | "tri" | "voronoi";
export type Tier = "strong" | "mid" | "weak";
export interface Cell { id: number; poly: [number, number][]; cx: number; cy: number; }
export interface GridSpec { type: GridType; seed: number; param: number; }
export interface Grid { type: GridType; seed: number; param: number; cells: Cell[]; }
export interface LevelTarget { cellId: number; rotation: number; }
export interface LevelMode { autoSnap: boolean; showTargetCount: boolean; }
export interface LevelLimits { timeLimit: number | null; hints: number; }
export interface LevelMeta { S: number; C: number; V_image: number; }
export interface LevelData {
  id: number; difficulty: number; image: string;
  grid: GridSpec; targets: LevelTarget[];
  mode: LevelMode; limits: LevelLimits;
  star: { clicks: number[]; time: number[] };
  meta: LevelMeta;
}
export interface LumaMatrix { w: number; h: number; data: Float32Array; }
export interface ManifestEntry { id: number; file: string; tier: Tier; pattern: string; seed: number; anisotropy: number; V_image: number; }
export interface Manifest { version: number; size: number; images: ManifestEntry[]; }