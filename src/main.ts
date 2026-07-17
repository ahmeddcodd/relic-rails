import './styles.css';
import { Game } from './game/game';
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

async function start(): Promise<void> {
  await loadGameAssets((loaded, total) => {
    preloadFill.style.width = `${Math.round((loaded / total) * 100)}%`;
  });
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
