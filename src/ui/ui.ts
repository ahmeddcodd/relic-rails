// ---------------------------------------------------------------------------
// DOM overlay UI. All elements created once; per-frame updates only touch the
// DOM when a displayed value actually changed.
// ---------------------------------------------------------------------------
import type { SaveData } from '../platform/save';

export interface UICallbacks {
  onRide(): void;
  onRideAgain(): void;
  onToMenu(): void;
  onOverdrive(): void;
  onSettingChanged(key: 'haptics' | 'reducedFx', value: boolean): void;
  getSettings(): SaveData['settings'];
}

export interface HudState {
  score: number;
  emberCount: number;
  prismCount: number;
  comboTier: number;
  comboName: string;
  odMeter: number; // 0..1
  odReady: boolean;
  odActive: boolean;
  powerups: string[]; // active labels
  pressure: number; // 0..1
}

export interface ResultsData {
  score: number;
  best: number;
  isNewBest: boolean;
  distance: number;
  ember: number;
  prism: number;
  bestCombo: number;
  caught: boolean;
  rank: string;
}

const RANKS: Array<[number, string]> = [
  [0, 'Tunnel Rookie'],
  [5000, 'Rail Scout'],
  [15000, 'Shard Runner'],
  [35000, 'Switchmaster'],
  [70000, 'Ember Driver'],
  [120000, 'Relic Hunter'],
  [200000, 'Abyss Rider'],
  [320000, 'Sunheart Legend'],
];

export function rankFor(bestScore: number): string {
  let r = RANKS[0][1];
  for (const [th, name] of RANKS) if (bestScore >= th) r = name;
  return r;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent: HTMLElement,
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export class UI {
  private root: HTMLElement;
  private loading: HTMLElement;
  private loadFill: HTMLElement;
  private menu: HTMLElement;
  private hud: HTMLElement;
  private results: HTMLElement;
  private settings: HTMLElement;
  private vignette: HTMLElement;
  private flash: HTMLElement;

  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private emberEl: HTMLElement;
  private prismEl: HTMLElement;
  private odBtn: HTMLButtonElement;
  private odRing: HTMLElement;
  private odLabel: HTMLElement;
  private puRow: HTMLElement;
  private skillEl: HTMLElement;
  private tutEl: HTMLElement;

  private menuBest: HTMLElement;
  private menuRank: HTMLElement;
  private menuEmber: HTMLElement;

  private lastHud: HudState = {
    score: -1, emberCount: -1, prismCount: -1, comboTier: -1, comboName: '',
    odMeter: -1, odReady: false, odActive: false, powerups: [], pressure: -1,
  };
  private skillTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cb: UICallbacks) {
    this.root = document.getElementById('ui-root')!;

    // Vignette + flash live under the screens
    this.vignette = el('div', '', this.root);
    this.vignette.id = 'vignette';
    this.flash = el('div', '', this.root);
    this.flash.id = 'flash';

    // --- Loading
    this.loading = el('div', 'screen', this.root);
    this.loading.id = 'loading';
    el('div', 'logo', this.loading, 'RELIC RAILS<small>ABYSS RUN</small>');
    const bar = el('div', 'loadbar', this.loading);
    this.loadFill = el('div', '', bar);
    el('div', 'loadhint', this.loading, 'Stoking the Sunheart Core…');

    // --- Menu
    this.menu = el('div', 'screen hidden', this.root);
    this.menu.id = 'menu';
    el('div', 'logo', this.menu, 'RELIC RAILS<small>ABYSS RUN</small>');
    const stats = el('div', 'menu-stats', this.menu);
    this.menuBest = statChip(stats, 'Best score');
    this.menuRank = statChip(stats, 'Rank');
    this.menuEmber = statChip(stats, 'Ember shards');
    const ride = el('button', 'btn-primary', this.menu, 'RIDE');
    ride.addEventListener('click', () => this.cb.onRide());
    const row = el('div', 'menu-row', this.menu);
    const settingsBtn = el('button', 'btn-ghost', row, 'Settings');
    settingsBtn.addEventListener('click', () => this.showSettings(true));
    el('div', 'hint-line', this.menu, 'Swipe ◀ ▶ to switch rails · swipe ▲ jump · ▼ duck<br/>Keyboard: A/D · W/Space · S · Shift = Overdrive');

    // --- HUD
    this.hud = el('div', 'screen hidden', this.root);
    this.hud.id = 'hud';
    const top = el('div', 'hud-top', this.hud);
    const left = el('div', 'hud-left', top);
    this.emberEl = el('div', 'hud-chip', left, '<span class="ico">◆</span><span>0</span>');
    this.emberEl.id = 'hud-ember';
    this.prismEl = el('div', 'hud-chip', left, '<span class="ico">✦</span><span>0</span>');
    this.prismEl.id = 'hud-prism';
    this.prismEl.style.display = 'none';
    const right = el('div', 'hud-right', top);
    this.scoreEl = el('div', 'hud-chip', right, '0');
    this.scoreEl.id = 'hud-score';
    this.comboEl = el('div', 'hud-chip', right, 'x1');
    this.comboEl.id = 'hud-combo';
    this.odBtn = el('button', '', this.hud) as HTMLButtonElement;
    this.odBtn.id = 'od-btn';
    this.odBtn.innerHTML = '<span class="flame">☀</span><span id="od-text">OVERDRIVE</span>';
    this.odRing = el('div', '', this.odBtn);
    this.odRing.id = 'od-ring';
    this.odLabel = this.odBtn.querySelector('#od-text') as HTMLElement;
    this.odBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onOverdrive();
    });
    this.puRow = el('div', '', this.hud);
    this.puRow.id = 'powerup-row';
    this.skillEl = el('div', '', this.hud);
    this.skillEl.id = 'skill-label';
    this.tutEl = el('div', '', this.hud);
    this.tutEl.id = 'tut-prompt';

    // --- Results
    this.results = el('div', 'screen hidden', this.root);
    this.results.id = 'results';

    // Pause/resume is fully controlled by YouTube Playables — no in-game pause
    // overlay or resume button. The platform renders its own pause UI.

    // --- Settings
    this.settings = el('div', 'screen hidden', this.root);
    this.settings.id = 'settings';
  }

  // --- screens -----------------------------------------------------------------
  setLoadProgress(p: number): void {
    this.loadFill.style.width = `${Math.round(p * 100)}%`;
  }

  private show(elm: HTMLElement, on: boolean): void {
    elm.classList.toggle('hidden', !on);
  }

  showLoading(on: boolean): void {
    this.show(this.loading, on);
  }

  showMenu(on: boolean, save?: SaveData): void {
    if (on && save) {
      (this.menuBest.querySelector('.v') as HTMLElement).textContent = fmt(save.bestScore);
      (this.menuRank.querySelector('.v') as HTMLElement).textContent = rankFor(save.bestScore);
      (this.menuEmber.querySelector('.v') as HTMLElement).textContent = fmt(save.totalEmber);
    }
    this.show(this.menu, on);
  }

  showHud(on: boolean): void {
    this.show(this.hud, on);
    if (on) {
      this.tutEl.classList.remove('show');
      this.skillEl.classList.remove('pop');
    }
  }

  showResults(on: boolean, d?: ResultsData): void {
    if (on && d) {
      this.results.innerHTML = '';
      el('div', d.isNewBest ? 'results-title best' : 'results-title', this.results, d.caught ? 'THE MAW TAKES YOU' : 'RUN OVER');
      if (d.isNewBest) el('div', 'newbest', this.results, '★ NEW BEST ★');
      el('div', 'results-score', this.results, fmt(d.score));
      const grid = el('div', 'results-grid', this.results);
      resultChip(grid, fmt(Math.round(d.distance)) + ' m', 'Distance');
      resultChip(grid, 'x' + d.bestCombo, 'Best combo');
      resultChip(grid, '◆ ' + fmt(d.ember), 'Ember shards');
      resultChip(grid, '✦ ' + fmt(d.prism), 'Prism shards');
      el('div', 'hint-line', this.results, `Best: ${fmt(d.best)} · ${d.rank}`);
      const again = el('button', 'btn-primary', this.results, 'RIDE AGAIN');
      again.addEventListener('click', () => this.cb.onRideAgain());
      const row = el('div', 'menu-row', this.results);
      const menuBtn = el('button', 'btn-ghost', row, 'Menu');
      menuBtn.addEventListener('click', () => this.cb.onToMenu());
    }
    this.show(this.results, on);
  }

  showSettings(on: boolean): void {
    if (on) {
      this.settings.innerHTML = '';
      const p = el('div', 'panel', this.settings);
      el('h2', '', p, 'SETTINGS');
      const s = this.cb.getSettings();
      // Music/SFX are intentionally NOT here — audio is governed by YouTube's
      // own mute control (isAudioEnabled / onAudioEnabledChange). Showing a
      // second in-game mute would violate the Playables audio policy.
      const rows: Array<['haptics' | 'reducedFx', string]> = [
        ['haptics', 'Haptics'],
        ['reducedFx', 'Reduced effects'],
      ];
      for (const [key, label] of rows) {
        const row = el('div', 'toggle-row', p);
        el('span', '', row, label);
        const btn = el('button', s[key] ? '' : 'off', row, s[key] ? 'ON' : 'OFF');
        btn.addEventListener('click', () => {
          s[key] = !s[key];
          btn.textContent = s[key] ? 'ON' : 'OFF';
          btn.classList.toggle('off', !s[key]);
          this.cb.onSettingChanged(key, s[key]);
        });
      }
      const close = el('button', 'btn-ghost', p, 'Close');
      close.addEventListener('click', () => this.show(this.settings, false));
    }
    this.show(this.settings, on);
  }

  // --- HUD updates -------------------------------------------------------------
  updateHud(s: HudState): void {
    const last = this.lastHud;
    if (s.score !== last.score) {
      this.scoreEl.textContent = fmt(s.score);
      last.score = s.score;
    }
    if (s.emberCount !== last.emberCount) {
      (this.emberEl.children[1] as HTMLElement).textContent = String(s.emberCount);
      last.emberCount = s.emberCount;
    }
    if (s.prismCount !== last.prismCount) {
      this.prismEl.style.display = s.prismCount > 0 ? '' : 'none';
      (this.prismEl.children[1] as HTMLElement).textContent = String(s.prismCount);
      last.prismCount = s.prismCount;
    }
    if (s.comboTier !== last.comboTier) {
      this.comboEl.textContent = `x${s.comboTier} ${s.comboName}`;
      this.comboEl.classList.remove('bump');
      void this.comboEl.offsetWidth; // restart animation
      this.comboEl.classList.add('bump');
      last.comboTier = s.comboTier;
    }
    const meterPct = Math.round(s.odMeter * 100);
    if (meterPct !== Math.round(last.odMeter * 100) || s.odReady !== last.odReady || s.odActive !== last.odActive) {
      this.odRing.style.background = `conic-gradient(var(--ember) ${meterPct}%, rgba(255,255,255,0.08) ${meterPct}%)`;
      this.odRing.style.mask = 'radial-gradient(circle, transparent 62%, black 64%)';
      (this.odRing.style as CSSStyleDeclaration & { webkitMask?: string }).webkitMask =
        'radial-gradient(circle, transparent 62%, black 64%)';
      this.odBtn.classList.toggle('ready', s.odReady);
      this.odBtn.classList.toggle('active', s.odActive);
      this.odLabel.textContent = s.odActive ? 'BURNING!' : s.odReady ? 'IGNITE!' : 'OVERDRIVE';
      last.odMeter = s.odMeter;
      last.odReady = s.odReady;
      last.odActive = s.odActive;
    }
    if (s.powerups.join() !== last.powerups.join()) {
      this.puRow.innerHTML = '';
      for (const p of s.powerups) el('div', 'pu-chip', this.puRow, p);
      last.powerups = [...s.powerups];
    }
    const pq = Math.round(s.pressure * 10);
    if (pq !== Math.round(last.pressure * 10)) {
      const a = Math.max(0, s.pressure - 0.35) * 0.9;
      this.vignette.style.boxShadow = a > 0.01 ? `inset 0 0 ${60 + a * 120}px rgba(180, 20, 10, ${a.toFixed(2)})` : 'none';
      last.pressure = s.pressure;
    }
  }

  skillLabel(text: string, kind: 'perfect' | 'nearmiss' | 'tier'): void {
    this.skillEl.textContent = text;
    this.skillEl.className = kind === 'perfect' ? '' : kind;
    this.skillEl.classList.remove('pop');
    void this.skillEl.offsetWidth;
    this.skillEl.classList.add('pop');
    if (this.skillTimer) clearTimeout(this.skillTimer);
    this.skillTimer = setTimeout(() => this.skillEl.classList.remove('pop'), 950);
  }

  tutorialPrompt(text: string | null): void {
    if (text) {
      this.tutEl.innerHTML = text;
      this.tutEl.classList.add('show');
    } else {
      this.tutEl.classList.remove('show');
    }
  }

  hitFlash(gold = false): void {
    this.flash.classList.toggle('gold', gold);
    this.flash.classList.remove('hit');
    void this.flash.offsetWidth;
    this.flash.classList.add('hit');
  }
}

function statChip(parent: HTMLElement, label: string): HTMLElement {
  const c = document.createElement('div');
  c.className = 'stat-chip';
  c.innerHTML = `<div class="v">0</div><div class="l">${label}</div>`;
  parent.appendChild(c);
  return c;
}

function resultChip(parent: HTMLElement, value: string, label: string): void {
  const c = document.createElement('div');
  c.className = 'stat-chip';
  c.innerHTML = `<div class="v">${value}</div><div class="l">${label}</div>`;
  parent.appendChild(c);
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
