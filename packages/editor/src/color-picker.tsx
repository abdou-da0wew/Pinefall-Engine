import { Button, Input } from "./ui";
import { useState, useRef, useEffect, useLayoutEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { clamp, normalizeHex, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, pickerBounds } from "./color";
import type { RGB, HSV, PickerBounds } from "./color";
const palette = [
  "#d8d1a7",
  "#c4cfa4",
  "#14211b",
  "#90aa96",
  "#6ac3a1",
  "#263c44",
  "#ffe2a3",
  "#d5b77a",
  "#d68b78",
  "#8fb7d1",
  "#ffffff",
  "#000000",
];
export function ColorPicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => {
    setOpen(false);
    anchor.current?.focus({ preventScroll: true });
  }, []);
  return (
    <>
      <Button
        ref={anchor}
        type="button"
        className="color-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span style={{ background: value }} />
        <code>{value.toUpperCase()}</code>
      </Button>
      {open && !disabled && (
        <ColorDialog
          key={value}
          label={label}
          initial={value}
          anchor={anchor}
          close={dismiss}
          apply={(color) => {
            onChange(color);
            setOpen(false);
            anchor.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
function ColorDialog({
  label,
  initial,
  anchor,
  close,
  apply,
}: {
  label: string;
  initial: string;
  anchor: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  apply: (color: string) => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(initial))),
    [hex, setHex] = useState(initial),
    [channels, setChannels] = useState(() => hexToRgb(initial).map(String)),
    [error, setError] = useState(""),
    [position, setPosition] = useState<PickerBounds | null>(null);
  const panel = useRef<HTMLDivElement>(null),
    hexInput = useRef<HTMLInputElement>(null);
  const title = useId(),
    hint = useId();
  const preview = rgbToHex(hsvToRgb(hsv));
  function changeHsv(next: HSV) {
    setHsv(next);
    const rgb = hsvToRgb(next);
    setHex(rgbToHex(rgb));
    setChannels(rgb.map(String));
    setError("");
  }
  function changeColor(color: string) {
    const rgb = hexToRgb(color),
      next = rgbToHsv(rgb);
    if (next.s === 0) next.h = hsv.h;
    setHsv(next);
    setHex(color);
    setChannels(rgb.map(String));
    setError("");
  }
  useLayoutEffect(() => {
    const node = panel.current,
      button = anchor.current;
    if (!node || !button) return;
    const place = () =>
      setPosition(
        pickerBounds(
          button.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
          node.scrollHeight,
        ),
      );
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    hexInput.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !anchor.current?.contains(event.target as Node)
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, close]);
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    changeHsv({
      ...hsv,
      s: clamp((event.clientX - box.left) / box.width),
      v: 1 - clamp((event.clientY - box.top) / box.height),
    });
  }
  return createPortal(
    <div
      ref={panel}
      className="color-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title}
      style={{
        left: position?.left || 8,
        top: position?.top || 8,
        width: position?.width || 304,
        maxHeight: position?.maxHeight || "calc(100dvh - 16px)",
        visibility: position ? "visible" : "hidden",
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          close();
        }
        if (event.key === "Tab") {
          const controls = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
            ) || [],
          );
          const i = controls.indexOf(document.activeElement as HTMLElement);
          if (event.shiftKey && i <= 0) {
            event.preventDefault();
            controls.at(-1)?.focus();
          } else if (!event.shiftKey && i === controls.length - 1) {
            event.preventDefault();
            controls[0]?.focus();
          }
        }
      }}
    >
      <header>
        <div>
          <small>COLOR STUDIO</small>
          <h3 id={title}>{label}</h3>
        </div>
        <Button aria-label="Close color picker" type="button" onClick={close}>
          <Icon name="close" />
        </Button>
      </header>
      <div
        className="color-sv"
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-describedby={hint}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            changeHsv({
              ...hsv,
              s: clamp(
                hsv.s + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
              ),
              v: clamp(
                hsv.v + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
              ),
            });
          }
        }}
      >
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: preview }} />
      </div>
      <label className="color-hue-label">
        Hue <span>{Math.round(hsv.h)}°</span>
        <Input
          className="color-hue"
          aria-label="Hue"
          type="range"
          min={0}
          max={359}
          step={1}
          value={hsv.h}
          onChange={(event) => changeHsv({ ...hsv, h: Number(event.target.value) })}
        />
      </label>
      <div className="color-preview">
        <Button
          title="Restore original color"
          aria-label="Restore original color"
          type="button"
          onClick={() => changeColor(initial)}
          style={{ background: initial }}
        />
        <span style={{ background: preview }} />
        <small>
          Original → Preview
          <br />
          Scene changes on Apply
        </small>
      </div>
      <label className="color-hex">
        HEX
        <Input
          ref={hexInput}
          aria-label="Hex color"
          value={hex}
          spellCheck={false}
          maxLength={7}
          aria-invalid={!!error}
          onChange={(event) => {
            const text = event.target.value;
            setHex(text);
            const color = normalizeHex(text);
            if (color) {
              const rgb = hexToRgb(color);
              const next = rgbToHsv(rgb);
              if (!next.s) next.h = hsv.h;
              setHsv(next);
              setChannels(rgb.map(String));
              setError("");
            } else setError("Enter 3 or 6 hexadecimal digits.");
          }}
          onBlur={() => {
            const color = normalizeHex(hex);
            if (color) setHex(color);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !error) {
              event.preventDefault();
              apply(preview);
            }
          }}
        />
      </label>
      <div className="color-rgb">
        {["R", "G", "B"].map((name, i) => (
          <label key={name}>
            {name}
            <Input
              aria-label={"Color " + name}
              type="number"
              min={0}
              max={255}
              step={1}
              value={channels[i]}
              onChange={(event) => {
                const values = [...channels];
                values[i] = event.target.value;
                setChannels(values);
                if (
                  values.every(
                    (v) =>
                      v.trim() !== "" &&
                      Number.isInteger(Number(v)) &&
                      Number(v) >= 0 &&
                      Number(v) <= 255,
                  )
                ) {
                  const rgb = values.map(Number) as RGB;
                  const next = rgbToHsv(rgb);
                  if (!next.s) next.h = hsv.h;
                  setHsv(next);
                  setHex(rgbToHex(rgb));
                  setError("");
                } else setError("RGB channels must be whole numbers from 0 to 255.");
              }}
            />
          </label>
        ))}
      </div>
      <div className="color-palette" aria-label="Pinefall palette">
        {palette.map((color) => (
          <Button
            key={color}
            aria-label={"Use " + color}
            title={color}
            type="button"
            style={{ background: color }}
            onClick={() => changeColor(color)}
            className={preview === color ? "chosen" : ""}
          />
        ))}
      </div>
      <p id={hint} className="color-hint">
        Arrows adjust saturation / brightness. Shift makes larger steps. Escape cancels.
      </p>
      {error && (
        <p className="color-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Button type="button" onClick={close}>
          Cancel
        </Button>
        <Button
          className="color-apply"
          disabled={!!error}
          type="button"
          onClick={() => apply(preview)}
        >
          <Icon name="check" />
          Apply color
        </Button>
      </footer>
    </div>,
    document.body,
  );
}
