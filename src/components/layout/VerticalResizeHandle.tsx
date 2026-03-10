"use client";

import { useCallback, useRef } from "react";

interface VerticalResizeHandleProps {
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function VerticalResizeHandle({ onResize, onResizeEnd }: VerticalResizeHandleProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientY - startY.current;
      startY.current = e.clientY;
      onResize(delta);
    },
    [onResize]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onResizeEnd?.();
    },
    [onResizeEnd]
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="group relative z-10 flex h-1 shrink-0 cursor-row-resize items-center justify-center touch-none -my-0.5"
    >
      <div className="w-full h-px bg-transparent transition-colors duration-150 group-hover:bg-border" />
    </div>
  );
}
