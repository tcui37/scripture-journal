"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { clampZoom, ZOOM_WHEEL_STEP } from "@/lib/constants";
import { fitPreviewScale, readPreviewPaddingInline } from "@/lib/layout";

interface Pan {
  pointerId: number;
  x: number;
  y: number;
  sl: number;
  st: number;
  moved: boolean;
}

/**
 * Preview zoom: fit-to-width (tracking the stage's size), or a custom scale
 * set by the control or ctrl/⌘-wheel, plus drag-to-pan on the stage.
 *
 * `layoutKey` is anything that moves the stage without resizing the sheet —
 * the rail opening or closing — so fit is re-measured.
 */
export function usePreviewZoom(sheetWidth: number, layoutKey: unknown) {
  const deskRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<Pan | null>(null);
  const [zoomFit, setZoomFit] = useState(true);
  const [customScale, setCustomScale] = useState(1);
  const [scale, setScale] = useState(0.62);

  useEffect(() => {
    if (zoomFit) return;
    setScale(customScale);
  }, [zoomFit, customScale]);

  useEffect(() => {
    if (!zoomFit) return;
    const stage = stageRef.current;
    const desk = deskRef.current;
    if (!stage) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const canvas = stage.querySelector(".preview-canvas");
        const paddingInline = readPreviewPaddingInline(canvas, stage.clientWidth);
        const fitScale = fitPreviewScale(stage.clientWidth, sheetWidth, paddingInline);
        setScale(fitScale);
        setCustomScale(fitScale);
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    if (desk) observer.observe(desk);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [zoomFit, sheetWidth, layoutKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let lastStep = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastStep < 50) return;
      lastStep = now;
      const direction = event.deltaY > 0 ? -1 : 1;
      setZoomFit(false);
      setCustomScale((current) => clampZoom(current + direction * ZOOM_WHEEL_STEP));
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const stopPan = useCallback((pointerId: number) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== pointerId) return;
    stageRef.current?.classList.remove("is-panning");
    panRef.current = null;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        sl: stage.scrollLeft,
        st: stage.scrollTop,
        moved: false,
      };
      stage.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!pan.moved && dx * dx + dy * dy < 9) return;
      if (!pan.moved) {
        pan.moved = true;
        stage.classList.add("is-panning");
      }
      event.preventDefault();
      stage.scrollLeft = pan.sl - dx;
      stage.scrollTop = pan.st - dy;
    };

    const onPointerEnd = (event: PointerEvent) => {
      stopPan(event.pointerId);
    };

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove, { passive: false });
    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);
    stage.addEventListener("lostpointercapture", onPointerEnd);

    return () => {
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", onPointerEnd);
      stage.removeEventListener("pointercancel", onPointerEnd);
      stage.removeEventListener("lostpointercapture", onPointerEnd);
    };
  }, [stopPan]);

  return { deskRef, stageRef, zoomFit, setZoomFit, scale, setCustomScale };
}
