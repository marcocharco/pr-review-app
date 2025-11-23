import React, { useState, useImperativeHandle, forwardRef } from "react";
import type { CanvasRef } from "./Canvas";

interface ZoomControlsProps {
  canvasRef: React.RefObject<CanvasRef | null>;
}

export interface ZoomControlsRef {
  setZoom: (zoom: number) => void;
}

export const ZoomControls = forwardRef<ZoomControlsRef, ZoomControlsProps>(
  ({ canvasRef }, ref) => {
    const [zoom, setZoom] = useState(1);

    useImperativeHandle(ref, () => ({
      setZoom: (z: number) => setZoom(z),
    }));

    return (
      <div className="flex flex-col gap-2">
        <div className="bg-[#18181b] border border-[#27272a] p-1 rounded-lg shadow-xl flex flex-col gap-1">
          <button
            className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={() => canvasRef.current?.zoomIn()}
          >
            +
          </button>
          <div className="h-px bg-[#27272a] mx-2" />
          <button
            className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={() => canvasRef.current?.zoomOut()}
          >
            -
          </button>
        </div>
        <div className="bg-[#18181b] border border-[#27272a] px-2 py-1 rounded-md shadow-xl text-[10px] text-center font-mono text-zinc-500">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    );
  }
);

