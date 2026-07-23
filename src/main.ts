import './styles.css';
import { Game } from './game/game';
import { getBridge } from './platform/bridge';
import { loadGameAssets } from './render/assets';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root')!;
const preload = document.createElement('div');
preload.className = 'screen';
preload.id = 'loading';
preload.innerHTML =
  '<div class="logo">RELIC RAILS<small>ABYSS RUN</small></div>' +
  '<div class="loadbar"><div></div></div>' +
  '<div class="loadhint">Loading the Emberdeep models…</div>';
uiRoot.appendChild(preload);
const preloadFill = preload.querySelector<HTMLElement>('.loadbar > div')!;

/**
 * Resolve once the browser has actually painted the current DOM.
 *
 * rAF is the accurate signal but it does NOT fire in a hidden or throttled tab,
 * so it is raced against a timer: nothing in boot may depend on compositing.
 */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 300);
  });
}

async function start(): Promise<void> {
  // Start the ~1.8 MiB model download IMMEDIATELY — it must never wait on a
  // paint. Separately, tell the platform we have pixels on screen as soon as
  // the loading screen renders so YouTube can drop its own spinner. The call is
  // idempotent and shares one bridge instance with Game, which repeats it after
  // the first WebGL frame as a fallback.
  const assets = loadGameAssets((loaded, total) => {
    preloadFill.style.width = `${Math.round((loaded / total) * 100)}%`;
  });
  void afterPaint().then(() => getBridge().firstFrameReady());
  await assets;
  preload.remove();
  const game = new Game(canvas);
  await game.boot();

  if (import.meta.env.DEV) {
    (window as unknown as { __game: Game }).__game = game;
  }
}

void start().catch((error: unknown) => {
  console.error('[boot] Failed to load authored assets', error);
  preload.querySelector<HTMLElement>('.loadhint')!.textContent = 'The mine failed to load. Please restart.';
});
