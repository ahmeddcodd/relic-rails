import './styles.css';
import { Game } from './game/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
void game.boot();

if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
}
