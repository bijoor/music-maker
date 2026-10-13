import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const HOLD_MS = 500;

/**
 * A name that can be renamed in place: press and hold it (or double-click with a mouse) and it turns into a text
 * box; Enter or tapping elsewhere saves, Escape keeps the old name. A plain tap still does whatever the
 * surrounding element does (e.g. selecting the track); the tap that ends a hold does not.
 */
export default function EditableName({ value, label, onRename, className }: { value: string; label: string; onRename: (name: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const down = (e: PointerEvent<HTMLSpanElement>) => {
    held.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { held.current = true; setEditing(true); }, HOLD_MS);
  };
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clearTimeout(timer.current);
  };
  const cancel = () => clearTimeout(timer.current);
  const finish = (save: boolean) => {
    const v = input.current?.value ?? value;
    setEditing(false);
    if (save && v.trim() && v.trim() !== value) onRename(v.trim());
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // typing a name does not play notes
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };

  if (editing) {
    return (
      <input
        ref={input}
        className={`namebox${className ? ` ${className}` : ''}`}
        aria-label={`Rename ${label}`}
        defaultValue={value}
        onKeyDown={key}
        onBlur={() => finish(true)}
        onClick={(e) => e.stopPropagation()}
        autoComplete="off"
      />
    );
  }
  return (
    <span
      className={`editname${className ? ` ${className}` : ''}`}
      title={`Press and hold to rename ${label}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onClickCapture={(e) => { if (held.current) { e.stopPropagation(); held.current = false; } }}
    >
      {value}
    </span>
  );
}
