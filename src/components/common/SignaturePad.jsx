import { useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────
   SIGNATURE PAD
   Finger/stylus signature captured on a canvas. Drawn at device pixel ratio so
   the stroke stays crisp when the declaration is printed on A4.
────────────────────────────────────────────── */
const SignaturePad = ({ value, onChange, disabled = false, height = 160 }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const dirtyRef = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  // Size the backing store to the element so strokes are not blurry
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const source = e.touches ? e.touches[0] : e;
    return { x: source.clientX - rect.left, y: source.clientY - rect.top };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pointFrom(e);
  };

  const move = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const point = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    dirtyRef.current = true;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onChange?.(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasInk(false);
    onChange?.('');
  };

  // An already-captured signature shows as an image, not an editable canvas
  if (value && !hasInk) {
    return (
      <div>
        <div className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-white">
          <img src={value} alt="Seller signature" className="w-full object-contain" style={{ height }} />
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="mt-2 text-xs font-bold text-[#ED2939]"
          >
            <i className="fas fa-rotate-left mr-1"></i>Sign again
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-[#002395]/30 rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, touchAction: 'none' }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <i className="fas fa-signature text-2xl text-gray-300"></i>
            <p className="text-xs text-gray-400 mt-1.5">Ask the seller to sign here</p>
          </div>
        )}
      </div>
      {hasInk && (
        <button type="button" onClick={clear} className="mt-2 text-xs font-bold text-[#ED2939]">
          <i className="fas fa-rotate-left mr-1"></i>Clear
        </button>
      )}
    </div>
  );
};

export default SignaturePad;
