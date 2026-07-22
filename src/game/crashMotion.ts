export type CrashDirection = -1 | 1;

export interface CrashMotion {
  lift: number;
  drift: number;
  recoil: number;
  squash: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number): number => 1 - Math.pow(1 - clamp01(value), 3);
const easeInOutCubic = (value: number): number => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/**
 * Small motion accents around the authored Blender crash clips.
 *
 * The GLBs provide the actual cart roll and Rin body performance. Keeping this
 * layer translation-only prevents a second rotation from compounding the clip
 * and pushing geometry through the chase camera.
 */
export function sampleCrashMotion(
  elapsed: number,
  direction: CrashDirection,
  duration: number,
): CrashMotion {
  const p = clamp01(elapsed / Math.max(0.001, duration));
  const firstHop = p >= 0.05 && p <= 0.55 ? Math.sin(((p - 0.05) / 0.5) * Math.PI) * 0.38 : 0;
  const landingBounce = p > 0.55 && p <= 0.8 ? Math.sin(((p - 0.55) / 0.25) * Math.PI) * 0.075 : 0;
  const squash = p <= 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;

  return {
    lift: Math.max(0, firstHop + landingBounce),
    drift: direction * easeInOutCubic(p / 0.72) * 0.32,
    recoil: -easeOutCubic(p / 0.38) * 0.28,
    squash,
  };
}
