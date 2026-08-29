"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  clampZoom,
  formatZoomPercent,
  snapZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SLIDER_STEP,
} from "@/lib/constants";

interface ZoomControlProps {
  fit: boolean;
  /** Current preview scale — computed when fit, fixed when custom. */
  scale: number;
  onFitChange: (fit: boolean) => void;
  onScaleChange: (scale: number) => void;
}

export default function ZoomControl({ fit, scale, onFitChange, onScaleChange }: ZoomControlProps) {
  const labelId = useId();
  const sliderId = useId();
  const popupId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const [sliderOpen, setSliderOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatZoomPercent(scale));

  useEffect(() => {
    if (!editing) setDraft(formatZoomPercent(scale));
  }, [scale, editing]);

  useEffect(() => {
    if (!sliderOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setSliderOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sliderOpen]);

  useEffect(() => {
    if (!sliderOpen) return;
    const onFocusIn = (event: FocusEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setSliderOpen(false);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [sliderOpen]);

  useEffect(() => {
    if (!sliderOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSliderOpen(false);
      setEditing(false);
      setDraft(formatZoomPercent(scale));
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sliderOpen, scale]);

  const commitPercent = useCallback(
    (raw: string) => {
      const trimmed = raw.trim().replace(/%$/, "");
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed)) {
        setDraft(formatZoomPercent(scale));
        return;
      }
      onFitChange(false);
      onScaleChange(clampZoom(parsed / 100));
    },
    [onFitChange, onScaleChange, scale],
  );

  const handleSliderChange = (value: number) => {
    onFitChange(false);
    onScaleChange(clampZoom(snapZoom(value)));
  };

  return (
    <div
      ref={controlRef}
      className={`zoom-control${sliderOpen ? " is-slider-open" : ""}`}
      aria-labelledby={labelId}
    >
      <span className="zoom-control-label" id={labelId}>
        Zoom
      </span>

      <button
        type="button"
        className={`zoom-fit-button${fit ? " is-on" : ""}`}
        aria-pressed={fit}
        onClick={() => {
          onFitChange(true);
          setSliderOpen(false);
        }}
      >
        Fit
      </button>

      <div className="zoom-percent">
        <input
          type="text"
          inputMode="numeric"
          className="zoom-percent-input"
          aria-label="Zoom percentage"
          aria-haspopup="true"
          aria-expanded={sliderOpen}
          aria-controls={popupId}
          value={editing ? draft : `${formatZoomPercent(scale)}%`}
          onPointerDown={() => setSliderOpen(true)}
          onFocus={(event) => {
            setSliderOpen(true);
            setEditing(true);
            setDraft(formatZoomPercent(scale));
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => {
            setEditing(false);
            commitPercent(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitPercent(draft);
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setSliderOpen(false);
              setEditing(false);
              setDraft(formatZoomPercent(scale));
              event.currentTarget.blur();
            }
          }}
        />

        <div
          id={popupId}
          className={`zoom-slider-popup${sliderOpen ? " is-open" : ""}`}
          role="group"
          aria-label="Zoom level"
          aria-hidden={!sliderOpen}
        >
          <input
            type="range"
            id={sliderId}
            className="zoom-slider"
            orient="vertical"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_SLIDER_STEP}
            value={clampZoom(scale)}
            aria-valuemin={ZOOM_MIN * 100}
            aria-valuemax={ZOOM_MAX * 100}
            aria-valuenow={Math.round(scale * 100)}
            aria-valuetext={`${Math.round(scale * 100)}%`}
            aria-label="Zoom level"
            tabIndex={sliderOpen ? 0 : -1}
            onChange={(event) => handleSliderChange(Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
