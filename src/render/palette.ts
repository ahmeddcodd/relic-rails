// ---------------------------------------------------------------------------
// Palette — single source of truth for every color in the game.
// Biome palettes drive fog, lighting, geometry tints. UI colors live in CSS
// variables mirrored in styles.css.
// ---------------------------------------------------------------------------

export interface BiomePalette {
  name: string;
  fog: number;
  fogNear: number;   // fraction of far plane
  fogFar: number;
  sky: number;       // renderer clear color
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  skyAccent: number;
  sunColor: number;
  sunStrength: number;
  starStrength: number;
  cloudStrength: number;
  hemiSky: number;
  hemiGround: number;
  keyLight: number;
  keyIntensity: number;
  ground: number;
  groundAlt: number;
  wall: number;
  wallAlt: number;
  ceiling: number;   // 0 = open sky biome (no ceiling ribbon)
  propA: number;     // biome prop tints
  propB: number;
  emissive: number;  // torch / crystal / magma glow
  hasCeiling: boolean;
}

// Biome order = play order. Dark Crystal Hollow opens the run; the red-hot
// Ember Forge is the climax finale. (Reordered per design: dark first, red last.)
export const BIOMES: BiomePalette[] = [
  {
    // 0 — Crystal Hollow: dark mineral cavern, cyan/violet glow (the "dark zone")
    // Opener + tutorial zone, so lit a touch brighter than a mid-run cavern.
    name: 'Crystal Hollow',
    fog: 0x140c28, fogNear: 0.22, fogFar: 124,
    sky: 0x0d0820,
    skyTop: 0x050218, skyHorizon: 0x42206f, skyBottom: 0x090624,
    skyAccent: 0x32e8df, sunColor: 0xa8fff7,
    sunStrength: 0.16, starStrength: 0.9, cloudStrength: 0.32,
    hemiSky: 0x8f74ff, hemiGround: 0x120d24,
    keyLight: 0xb0c4ff, keyIntensity: 2.1,
    ground: 0x453c72, groundAlt: 0x38305c,
    wall: 0x554a86, wallAlt: 0x433870,
    ceiling: 0x211a3a,
    propA: 0x54e8e0, propB: 0xb46cff,
    emissive: 0x64f0e8,
    hasCeiling: true,
  },
  {
    // 1 — Timber Maw Mine: warm torchlit timber tunnel
    name: 'Timber Maw Mine',
    fog: 0x2a1608, fogNear: 0.25, fogFar: 105,
    sky: 0x1a0d05,
    skyTop: 0x100402, skyHorizon: 0x6b2a09, skyBottom: 0x1d0903,
    skyAccent: 0xff7626, sunColor: 0xffc06b,
    sunStrength: 0.18, starStrength: 0.08, cloudStrength: 0.22,
    hemiSky: 0xffa95e, hemiGround: 0x2b1408,
    keyLight: 0xffc07a, keyIntensity: 2.4,
    ground: 0x6b4a30, groundAlt: 0x573b22,
    wall: 0x7a5430, wallAlt: 0x624223,
    ceiling: 0x2e1c0e,
    propA: 0x6b4a2a, propB: 0x8a6238,
    emissive: 0xff8c2e,
    hasCeiling: true,
  },
  {
    // 2 — Flooded Ravine: open sunset gorge, waterfalls (bright relief)
    name: 'Flooded Ravine',
    fog: 0xe8935e, fogNear: 0.35, fogFar: 150,
    sky: 0xff9e63,
    skyTop: 0x456fbd, skyHorizon: 0xffaa67, skyBottom: 0xa84261,
    skyAccent: 0xffdfb0, sunColor: 0xfff0b0,
    sunStrength: 1.0, starStrength: 0.0, cloudStrength: 0.75,
    hemiSky: 0xffc48f, hemiGround: 0x3c4a3a,
    keyLight: 0xffd9a8, keyIntensity: 2.8,
    ground: 0x55604a, groundAlt: 0x47523d,
    wall: 0x6e6250, wallAlt: 0x5a5040,
    ceiling: 0,
    propA: 0x4f7a5a, propB: 0x8fa0b8,
    emissive: 0x9fd8ff,
    hasCeiling: false,
  },
  {
    // 3 — Ember Forge: blackened iron and magma (the "red zone" — finale)
    name: 'Ember Forge',
    fog: 0x330d02, fogNear: 0.22, fogFar: 110,
    sky: 0x1c0602,
    skyTop: 0x090106, skyHorizon: 0x7c1b07, skyBottom: 0x1b0202,
    skyAccent: 0xff4311, sunColor: 0xffa23c,
    sunStrength: 0.42, starStrength: 0.32, cloudStrength: 0.55,
    hemiSky: 0xff6a2a, hemiGround: 0x1e0a04,
    keyLight: 0xff9448, keyIntensity: 2.2,
    ground: 0x4d4846, groundAlt: 0x3c3836,
    wall: 0x5a504c, wallAlt: 0x453d3a,
    ceiling: 0x241f1d,
    propA: 0x4a4442, propB: 0x6e2f1a,
    emissive: 0xff4a12,
    hasCeiling: true,
  },
];

// Shared gameplay colors (never biome dependent — readability language).
export const COLORS = {
  ember: 0xffa826,        // main collectible — warm gold
  emberCore: 0xffe9b0,
  prism: 0xc06cff,        // rare collectible — violet
  prismCore: 0xf2dcff,
  hazard: 0xff3b2e,       // danger accents — always hot red
  hazardLamp: 0xff2418,
  safe: 0x3ef0a0,         // power-ups / positive pickups — mint
  railTop: 0x9a8f80,
  railSide: 0x4d453c,
  tie: 0x3a2c1c,
  cartBody: 0x5a6b7a,     // rusted steel blue-grey
  cartTrim: 0xc4762e,     // copper trim
  cartWheel: 0x2e2a26,
  sunheart: 0xffc94d,     // the stolen core — golden glow
  rinSkin: 0xe8b08a,
  rinJacket: 0x9a4a2e,    // burnt-sienna scavenger jacket
  rinScarf: 0xe8d44d,
  rinHair: 0x442818,
  maw: 0x1c1a18,
  mawEye: 0xff3520,
  shield: 0x58c8ff,
  overdrive: 0xffc94d,
} as const;
