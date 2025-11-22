import { useState, useRef } from "react";
import { GitPullRequest, ArrowRight } from "lucide-react";

// --- Main App ---

export default function App() {
  // Inputs
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [prNumber, setPrNumber] = useState("");

  // Canvas State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // --- Canvas Logic ---

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      e.target === containerRef.current ||
      (target.classList && target.classList.contains("canvas-bg"))
    ) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY,
      }));
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest && target.closest(".overflow-y-auto")) return;

    const ZOOM_SPEED = 0.001;
    const newZoom = Math.max(0.1, Math.min(3, zoom - e.deltaY * ZOOM_SPEED));
    setZoom(newZoom);
  };

  return (
    <div className="w-screen h-screen bg-[#09090b] flex flex-col overflow-hidden font-sans text-zinc-300 selection:bg-blue-500/30">
      {/* Header */}
      <div className="h-14 bg-[#09090b] border-b border-[#27272a] px-6 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-2 text-zinc-100 font-bold text-lg tracking-tight">
          <GitPullRequest className="text-blue-500" size={20} />
          <span>CanvasReview</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-px bg-[#18181b] p-0.5 rounded border border-[#27272a]">
            <input
              placeholder="Owner"
              className="bg-transparent text-xs px-3 py-1.5 outline-none w-24 text-zinc-300 placeholder:text-zinc-600 focus:bg-[#27272a] transition-colors rounded-sm"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
            <span className="text-zinc-700">/</span>
            <input
              placeholder="Repo"
              className="bg-transparent text-xs px-3 py-1.5 outline-none w-24 text-zinc-300 placeholder:text-zinc-600 focus:bg-[#27272a] transition-colors rounded-sm"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <span className="text-zinc-700">#</span>
            <input
              placeholder="PR"
              className="bg-transparent text-xs px-3 py-1.5 outline-none w-16 text-zinc-300 placeholder:text-zinc-600 focus:bg-[#27272a] transition-colors rounded-sm"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
            />
          </div>

          <input
            type="password"
            placeholder="Personal Access Token"
            className="bg-[#18181b] text-xs px-3 py-2 rounded border border-[#27272a] outline-none w-48 transition-all text-zinc-300 placeholder:text-zinc-600 focus:border-blue-500/50"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          <div className="h-6 w-px bg-[#27272a] mx-1" />

          <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
            <ArrowRight size={14} />
            Load PR
          </button>
        </div>
      </div>

      {/* Infinite Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-[#09090b] cursor-move canvas-bg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Dot Grid Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundImage: `radial-gradient(#52525b 1px, transparent 1px)`,
          }}
        />

        {/* Transform Layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="absolute top-0 left-0 w-0 h-0 pointer-events-none"
        ></div>

        {/* Empty State */}
        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
          <div className="w-20 h-20 bg-[#18181b] rounded-2xl border border-[#27272a] flex items-center justify-center mb-6 shadow-2xl shadow-black">
            <GitPullRequest size={40} className="text-zinc-500" />
          </div>
          <h2 className="text-zinc-200 text-lg font-medium mb-2">
            Ready to Review
          </h2>
          <p className="text-zinc-500 text-sm max-w-xs text-center leading-relaxed">
            Enter a public GitHub repository above to get started.
          </p>
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto">
          <div className="bg-[#18181b] border border-[#27272a] p-1 rounded-lg shadow-xl flex flex-col gap-1">
            <button
              className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
              onClick={() => setZoom((z) => z + 0.1)}
            >
              +
            </button>
            <div className="h-px bg-[#27272a] mx-2" />
            <button
              className="p-2 hover:bg-[#27272a] rounded text-zinc-400 hover:text-zinc-100 transition-colors"
              onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))}
            >
              -
            </button>
          </div>
          <div className="bg-[#18181b] border border-[#27272a] px-2 py-1 rounded-md shadow-xl text-[10px] text-center font-mono text-zinc-500">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
