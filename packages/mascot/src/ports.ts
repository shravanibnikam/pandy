/**
 * Structural ports rather than DOM types, so the animator can be driven by a
 * recording double in tests without pulling in jsdom. A real
 * CanvasRenderingContext2D and a real ImageBitmap both satisfy these.
 */

export interface SpriteImage {
  readonly width: number;
  readonly height: number;
}

export interface DrawTarget {
  imageSmoothingEnabled: boolean;
  clearRect(x: number, y: number, w: number, h: number): void;
  /**
   * The parameter is widened to include CanvasImageSource so a real
   * CanvasRenderingContext2D is assignable to DrawTarget. Method parameters are
   * checked bivariantly, and CanvasImageSource is assignable to this union even
   * though the structural SpriteImage alone is not — SVGImageElement has no
   * numeric width. Without the union, passing a real canvas context fails.
   */
  drawImage(
    image: SpriteImage | CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/** Animation-frame scheduling, injected so tests can step it by hand. */
export interface FrameHost {
  requestAnimationFrame(cb: (timeMs: number) => void): number;
  cancelAnimationFrame(handle: number): void;
}

export interface SpriteSheet {
  readonly image: SpriteImage;
  readonly frames: number;
}

export const browserFrameHost: FrameHost = {
  requestAnimationFrame: (cb) => globalThis.requestAnimationFrame(cb),
  cancelAnimationFrame: (h) => globalThis.cancelAnimationFrame(h),
};
