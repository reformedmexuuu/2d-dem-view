export const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Mutable playback clock; read every animation frame without React re-renders. */
export class Clock {
  tick: number;
  playing = false;
  speed = 1;

  constructor(
    public min: number,
    public max: number,
    public rate: number,
  ) {
    this.tick = min;
  }

  advance(dtMs: number) {
    if (!this.playing) return;
    this.tick += (dtMs / 1000) * this.rate * this.speed;
    if (this.tick >= this.max) {
      this.tick = this.max;
      this.playing = false;
    }
  }

  seek(t: number) {
    this.tick = Math.min(this.max, Math.max(this.min, t));
  }

  toggle() {
    if (!this.playing && this.tick >= this.max) this.tick = this.min;
    this.playing = !this.playing;
  }
}
