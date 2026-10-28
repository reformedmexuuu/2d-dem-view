import { useEffect, useMemo, useRef } from 'react';
import { RADAR_SIZE, makeProjection, type MapAssets } from '../maps';
import { buildSilhouette, drawScene, type View } from '../render/draw';
import { roundIndexAt } from '../timeline';
import type { DemoData } from '../types';
import type { Clock } from '../clock';

interface Props {
  data: DemoData;
  assets: MapAssets;
  clock: Clock;
  level: 'upper' | 'lower';
  slots: Map<number, number>;
  selected: number | null;
  showNames: boolean;
}

export function RadarCanvas({ data, assets, clock, level, slots, selected, showNames }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ s: 1, ox: 0, oy: 0 });
  const userMoved = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const dirty = useRef(true);
  const lastTick = useRef(-1);

  const proj = useMemo(() => makeProjection(assets.meta, data.bounds), [assets.meta, data.bounds]);
  const silhouette = useMemo(() => (assets.upper ? null : buildSilhouette(data, proj)), [assets.upper, data, proj]);

  const propsRef = useRef({ level, slots, selected, showNames });
  propsRef.current = { level, slots, selected, showNames };
  useEffect(() => {
    dirty.current = true;
  }, [level, slots, selected, showNames, assets]);

  const fit = () => {
    const { w, h } = sizeRef.current;
    const s = Math.min(w, h) / RADAR_SIZE;
    viewRef.current = { s, ox: (w - RADAR_SIZE * s) / 2, oy: (h - RADAR_SIZE * s) / 2 };
    userMoved.current = false;
    dirty.current = true;
  };

  // resize
  useEffect(() => {
    const el = wrapRef.current!;
    const cv = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { w: Math.max(1, rect.width), h: Math.max(1, rect.height), dpr };
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
      if (!userMoved.current) fit();
      dirty.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // render loop
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.tick;
      if (!dirty.current && t === lastTick.current) return;
      dirty.current = false;
      lastTick.current = t;
      const { w, h, dpr } = sizeRef.current;
      const ri = roundIndexAt(data, t);
      const pr = propsRef.current;
      const image = pr.level === 'lower' && assets.lower ? assets.lower : assets.upper ?? silhouette;
      drawScene(ctx, {
        data,
        proj,
        tick: t,
        view: viewRef.current,
        width: w,
        height: h,
        dpr,
        image,
        level: pr.level,
        lowerAltitudeMax: assets.meta?.lowerAltitudeMax,
        round: ri >= 0 ? data.rounds[ri] : undefined,
        slots: pr.slots,
        selected: pr.selected,
        showNames: pr.showNames,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, assets, proj, silhouette, clock]);

  // pan / zoom (mouse, touch, pen)
  useEffect(() => {
    const cv = canvasRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let lastDist = 0;
    let lastTap = 0;

    const zoomAt = (mx: number, my: number, f: number) => {
      const v = viewRef.current;
      const fitS = Math.min(sizeRef.current.w, sizeRef.current.h) / RADAR_SIZE;
      const ns = Math.min(fitS * 10, Math.max(fitS * 0.8, v.s * f));
      const k = ns / v.s;
      viewRef.current = { s: ns, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
      userMoved.current = true;
      dirty.current = true;
    };
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(e);
      zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      if (pts.size === 1) {
        const now = performance.now();
        if (now - lastTap < 300) fit();
        lastTap = now;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = local(e);
      if (pts.size === 1) {
        const v = viewRef.current;
        viewRef.current = { ...v, ox: v.ox + cur.x - prev.x, oy: v.oy + cur.y - prev.y };
        userMoved.current = true;
        dirty.current = true;
      }
      pts.set(e.pointerId, cur);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastDist);
        lastDist = d;
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastDist = 0;
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    return () => {
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <div className="radar" ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="Radar mapy" />
      <button className="radar-reset" onClick={fit} title="Dopasuj widok (lub stuknij dwukrotnie)" aria-label="Dopasuj widok">
        ⤢
      </button>
    </div>
  );
}
