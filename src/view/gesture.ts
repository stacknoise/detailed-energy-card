/** Timers of the gesture, replaceable in tests. */
export interface GestureTimers {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const browserTimers: GestureTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

/** Holding for this long (ms) is a hold. */
export const HOLD_MS = 500;
/** A second click within this time (ms) is a double tap; a tap waits this long when a double tap is configured. */
export const DOUBLE_MS = 250;

export interface GestureOptions {
  /** a hold action is configured: pressing for {@link HOLD_MS} runs it and the click that follows is ignored */
  hold: boolean;
  /** a double tap action is configured: a single tap waits {@link DOUBLE_MS} for a second one */
  double: boolean;
  onTap(): void;
  onHold(): void;
  onDouble(): void;
}

/**
 * Tell tap, hold and double tap apart for one element, like the action handler of Home Assistant does. Without a hold or
 * double tap action a click runs the tap at once, so an element with only a tap action reacts as before. The options are
 * replaced on every render, so the gesture of an element keeps running over re-renders.
 */
export class Gesture {
  private _opts: GestureOptions = { hold: false, double: false, onTap: () => {}, onHold: () => {}, onDouble: () => {} };
  private _holdTimer = 0;
  private _tapTimer = 0;
  private _held = false;

  constructor(private readonly _timers: GestureTimers = browserTimers) {}

  update(opts: GestureOptions): void {
    this._opts = opts;
  }

  down(): void {
    this._held = false;
    this._timers.clear(this._holdTimer);
    if (!this._opts.hold) return;
    this._holdTimer = this._timers.set(() => {
      this._holdTimer = 0;
      this._held = true;
      this._opts.onHold();
    }, HOLD_MS);
  }

  /** The finger or the button is up, or it left the element: an unfinished hold is over. */
  up(): void {
    this._timers.clear(this._holdTimer);
    this._holdTimer = 0;
  }

  click(): void {
    // the click that ends a hold is not a tap
    if (this._held) {
      this._held = false;
      return;
    }
    if (!this._opts.double) {
      this._opts.onTap();
      return;
    }
    if (this._tapTimer) {
      this._timers.clear(this._tapTimer);
      this._tapTimer = 0;
      this._opts.onDouble();
      return;
    }
    this._tapTimer = this._timers.set(() => {
      this._tapTimer = 0;
      this._opts.onTap();
    }, DOUBLE_MS);
  }
}
