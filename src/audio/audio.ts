// ---------------------------------------------------------------------------
// Procedural WebAudio: layered music (base / arp / chase stems), wheel rumble
// tied to speed, and synthesized SFX. No audio files. No autoplay: the
// context is only created after a user gesture, and the platform audio state
// gates the master bus.
// ---------------------------------------------------------------------------

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private arpGain: GainNode | null = null;
  private chaseGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextNoteTime = 0;

  platformAudio = true; // from ytgame.system.isAudioEnabled
  musicOn = true;
  sfxOn = true;
  private paused = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    // While the platform has us paused the bus stays silent, no matter what
    // gesture arrives. Without this, a first-ever tap during a pause would
    // CREATE the context and start the music sequencer mid-pause.
    if (this.paused) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    // Wheel rumble: looping filtered noise
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.rumbleFilter = this.ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 120;
    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0;
    src.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.sfxBus);
    src.start();

    // Music stem gains
    this.arpGain = this.ctx.createGain();
    this.arpGain.gain.value = 0;
    this.arpGain.connect(this.musicBus);
    this.chaseGain = this.ctx.createGain();
    this.chaseGain.gain.value = 0;
    this.chaseGain.connect(this.musicBus);

    this.applyMix();
    this.startSequencer();
  }

  applyMix(): void {
    if (!this.master) return;
    this.master.gain.value = this.platformAudio ? 1 : 0;
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.5 : 0;
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxOn ? 0.85 : 0;
  }

  pause(): void {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** speed 0..1, chase 0..1, intensity 0..1 (combo) */
  setDynamics(speed: number, chase: number, intensity: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.rumbleGain && this.rumbleFilter) {
      this.rumbleGain.gain.setTargetAtTime(speed * 0.16, t, 0.2);
      this.rumbleFilter.frequency.setTargetAtTime(90 + speed * 260, t, 0.2);
    }
    if (this.arpGain) this.arpGain.gain.setTargetAtTime(intensity > 0.3 ? 0.5 : 0, t, 0.6);
    if (this.chaseGain) this.chaseGain.gain.setTargetAtTime(chase > 0.45 ? (chase - 0.45) * 1.3 : 0, t, 0.4);
  }

  // --- music sequencer -------------------------------------------------------
  private startSequencer(): void {
    if (this.musicTimer || !this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 90);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.paused) return;
    const spb = 60 / 120 / 2; // 120 bpm, 8th notes
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextNoteTime);
      this.step = (this.step + 1) % 32;
      this.nextNoteTime += spb;
    }
  }

  // E natural-minor drive: bass E2/G2/D2/A2, arp above.
  private static BASS = [40, 40, 43, 40, 38, 38, 45, 43];
  private static ARP = [64, 67, 71, 74, 71, 67, 76, 71];

  private playStep(step: number, t: number): void {
    if (!this.musicBus) return;
    if (step % 4 === 0) {
      const midi = AudioSys.BASS[(step / 4) % 8];
      this.tone(midi2hz(midi), t, 0.42, 'triangle', 0.28, this.musicBus, 0.02, 4);
    }
    // hat tick
    if (step % 2 === 0) this.noiseHit(t, 0.03, 5200, 0.05, this.musicBus);
    // arp stem
    if (this.arpGain && this.arpGain.gain.value > 0.02) {
      const midi = AudioSys.ARP[step % 8];
      this.tone(midi2hz(midi), t, 0.14, 'square', 0.06, this.arpGain, 0.01, 8);
    }
    // chase stem: dissonant pulse on off-beats
    if (this.chaseGain && this.chaseGain.gain.value > 0.02 && step % 8 === 6) {
      this.tone(midi2hz(46), t, 0.3, 'sawtooth', 0.2, this.chaseGain, 0.01, 6);
      this.tone(midi2hz(47), t, 0.3, 'sawtooth', 0.14, this.chaseGain, 0.01, 6);
    }
  }

  // --- synth helpers -----------------------------------------------------------
  private tone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    out: AudioNode,
    attack = 0.005,
    decayRate = 6,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + attack, dur / decayRate);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.3);
  }

  private noiseHit(t: number, dur: number, freq: number, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur * 3));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  private sfx(fn: (t: number) => void): void {
    if (!this.ctx || !this.sfxOn || !this.platformAudio || this.paused) return;
    fn(this.ctx.currentTime);
  }

  // --- game SFX ------------------------------------------------------------------
  collect(streak: number): void {
    this.sfx((t) => {
      const f = 660 * Math.pow(1.06, Math.min(12, streak));
      this.tone(f, t, 0.1, 'sine', 0.16, this.sfxBus!, 0.004, 5);
      this.tone(f * 1.5, t + 0.03, 0.08, 'sine', 0.08, this.sfxBus!, 0.004, 5);
    });
  }
  prism(): void {
    this.sfx((t) => {
      for (let i = 0; i < 4; i++) this.tone(880 * Math.pow(1.25, i), t + i * 0.05, 0.2, 'sine', 0.12, this.sfxBus!);
    });
  }
  jump(): void {
    this.sfx((t) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(620, t + 0.16);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setTargetAtTime(0, t + 0.1, 0.05);
      o.connect(g).connect(this.sfxBus!);
      o.start(t);
      o.stop(t + 0.3);
    });
  }
  land(): void {
    this.sfx((t) => this.noiseHit(t, 0.08, 300, 0.22, this.sfxBus!));
  }
  switch(): void {
    this.sfx((t) => {
      this.noiseHit(t, 0.05, 1800, 0.12, this.sfxBus!);
      this.tone(220, t, 0.07, 'square', 0.05, this.sfxBus!);
    });
  }
  duck(): void {
    this.sfx((t) => this.noiseHit(t, 0.06, 900, 0.1, this.sfxBus!));
  }
  stumble(): void {
    this.sfx((t) => {
      this.noiseHit(t, 0.15, 500, 0.3, this.sfxBus!);
      this.tone(110, t, 0.3, 'sawtooth', 0.15, this.sfxBus!);
    });
  }
  crash(): void {
    this.sfx((t) => {
      this.noiseHit(t, 0.4, 350, 0.5, this.sfxBus!);
      this.noiseHit(t + 0.08, 0.3, 180, 0.4, this.sfxBus!);
      this.tone(70, t, 0.7, 'sawtooth', 0.3, this.sfxBus!, 0.01, 3);
    });
  }
  perfect(): void {
    this.sfx((t) => {
      this.tone(1040, t, 0.12, 'sine', 0.12, this.sfxBus!);
      this.tone(1560, t + 0.05, 0.14, 'sine', 0.1, this.sfxBus!);
    });
  }
  tierUp(tier: number): void {
    this.sfx((t) => {
      for (let i = 0; i <= tier; i++) this.tone(520 * Math.pow(1.2, i), t + i * 0.06, 0.16, 'triangle', 0.12, this.sfxBus!);
    });
  }
  powerup(): void {
    this.sfx((t) => {
      this.tone(520, t, 0.14, 'triangle', 0.14, this.sfxBus!);
      this.tone(780, t + 0.08, 0.18, 'triangle', 0.14, this.sfxBus!);
    });
  }
  overdriveReady(): void {
    this.sfx((t) => {
      this.tone(660, t, 0.3, 'sine', 0.14, this.sfxBus!);
      this.tone(990, t + 0.12, 0.35, 'sine', 0.12, this.sfxBus!);
    });
  }
  overdriveStart(): void {
    this.sfx((t) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.5);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.setTargetAtTime(0, t + 0.45, 0.12);
      o.connect(g).connect(this.sfxBus!);
      o.start(t);
      o.stop(t + 1);
      this.noiseHit(t + 0.4, 0.2, 2000, 0.16, this.sfxBus!);
    });
  }
  horn(): void {
    this.sfx((t) => {
      this.tone(233, t, 0.5, 'square', 0.12, this.sfxBus!, 0.02, 3);
      this.tone(311, t, 0.5, 'square', 0.1, this.sfxBus!, 0.02, 3);
    });
  }
  button(): void {
    this.sfx((t) => this.tone(440, t, 0.08, 'sine', 0.1, this.sfxBus!));
  }
  newBest(): void {
    this.sfx((t) => {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => this.tone(f, t + i * 0.09, 0.25, 'triangle', 0.14, this.sfxBus!));
    });
  }
}

function midi2hz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
