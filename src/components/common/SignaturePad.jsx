import { useCallback, useEffect, useRef, useState } from 'react';

/* ─────────────────────────────────────────────
   SIGNATURE PAD

   Signing happens in a full screen sheet rather than a strip inside the form,
   because a seller handed the phone across the counter needs room to write.

   On a phone the sheet is taller than it is wide, which is the wrong shape for a
   signature. The app is installed as a portrait-locked PWA, so turning the
   handset does not reflow it - instead the canvas itself is rotated a quarter
   turn, letting the signature run along the long edge of the screen. Pointer
   coordinates are mapped back through that rotation.

   Strokes are kept as point arrays rather than painted straight onto the canvas
   and forgotten. That is what makes Undo possible: people sign letter by letter,
   and losing one bad letter should not mean redrawing the whole signature.
────────────────────────────────────────────── */

const PEN_COLOR = '#0f172a';
const PEN_WIDTH = 2.4;

const SignaturePad = ({ value, onChange, disabled = false, height = 160 }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  /* Mirrors strokesRef.current.length purely so the placeholder and the
     Undo/Clear buttons re-render; the strokes themselves stay in a ref so
     drawing never waits on React. */
  const [strokeCount, setStrokeCount] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [turned, setTurned] = useState(null); // null = follow the sheet's shape

  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const strokesRef = useRef([]);   // [[{x, y}, ...], ...] - one array per pen-down..pen-up
  const backupRef = useRef([]);    // snapshot taken when the sheet opens, restored on cancel
  const activeRef = useRef(null);  // the stroke currently being drawn
  const observerRef = useRef(null);
  const boxObserverRef = useRef(null);

  // Upright on a wide sheet, turned on a tall one, unless the user overrode it
  const rotated = turned === null ? box.h > box.w : turned;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // clientWidth/Height are the untransformed layout size, so these stay
    // correct while the element is rotated
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PEN_COLOR;
    ctx.fillStyle = PEN_COLOR;

    for (const stroke of strokesRef.current) {
      if (stroke.length === 1) {
        // A tap with no movement - draw the dot it would otherwise miss
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  /* Setting canvas.width resets the whole 2d context, so pen settings are
     reapplied by paint() on every fit. */
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    paint();
  }, [paint]);

  /* Callback refs rather than effects: they run the moment React attaches the
     node, so the backing store is sized before the first stroke can land. The
     observers then keep it correct through rotation and keyboard resizes. */
  const attachCanvas = useCallback((node) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    canvasRef.current = node;
    if (!node) return;
    fitCanvas();
    const observer = new ResizeObserver(() => fitCanvas());
    observer.observe(node);
    observerRef.current = observer;
  }, [fitCanvas]);

  const attachBox = useCallback((node) => {
    boxObserverRef.current?.disconnect();
    boxObserverRef.current = null;
    boxRef.current = node;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    boxObserverRef.current = observer;
  }, []);

  useEffect(() => () => {
    observerRef.current?.disconnect();
    boxObserverRef.current?.disconnect();
  }, []);

  /* Turning the canvas swaps its width and height through inline styles, which
     a ResizeObserver does not reliably report, so re-fit explicitly whenever the
     orientation or the sheet's size changes. */
  useEffect(() => { fitCanvas(); }, [rotated, box.w, box.h, fitCanvas]);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [sheetOpen]);

  /* Map a viewport point into the canvas's own coordinates. When the canvas is
     turned a quarter turn clockwise its local +x runs down the screen and its
     local +y runs to the left, so the rotation has to be undone here. */
  const pointFrom = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (!rotated) return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const centreX = rect.left + rect.width / 2;
    const centreY = rect.top + rect.height / 2;
    return {
      x: canvas.clientWidth / 2 + (e.clientY - centreY),
      y: canvas.clientHeight / 2 - (e.clientX - centreX),
    };
  };

  const startStroke = (e) => {
    if (disabled) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    activeRef.current = [pointFrom(e)];
    strokesRef.current = [...strokesRef.current, activeRef.current];
    setStrokeCount(strokesRef.current.length);
    setCleared(false);
    paint();
  };

  // Draw only the new segment while the pen is down - repainting every stroke
  // on every move would get heavy on a long signature
  const extendStroke = (e) => {
    if (!activeRef.current) return;
    e.preventDefault();
    const stroke = activeRef.current;
    const previous = stroke[stroke.length - 1];
    const point = pointFrom(e);
    stroke.push(point);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const endStroke = () => { activeRef.current = null; };

  const undo = () => {
    if (!strokesRef.current.length) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    if (!strokesRef.current.length) setCleared(true);
    paint();
  };

  const clearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    setCleared(true);
    setConfirmClear(false);
    paint();
  };

  const openSheet = () => {
    if (disabled) return;
    backupRef.current = strokesRef.current.map(stroke => stroke.slice());
    setStrokeCount(strokesRef.current.length);
    setConfirmClear(false);
    setCleared(false);
    setSheetOpen(true);
  };

  const cancelSheet = () => {
    strokesRef.current = backupRef.current.map(stroke => stroke.slice());
    setStrokeCount(strokesRef.current.length);
    setConfirmClear(false);
    setSheetOpen(false);
  };

  /* Closing without drawing leaves an existing signature alone. It is only
     removed when the seller actually erased it, so tapping through the sheet by
     accident cannot wipe a signature that is already on file. */
  const saveSheet = () => {
    if (strokesRef.current.length) {
      onChange?.(canvasRef.current.toDataURL('image/png'));
    } else if (cleared) {
      onChange?.('');
    }
    setSheetOpen(false);
  };

  // Rotating changes the drawing surface, so existing strokes would no longer
  // line up - only offer it before anything has been drawn
  const toggleRotation = () => setTurned(!rotated);

  const canvasStyle = rotated
    ? {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: box.h ? `${box.h}px` : '100%',
      height: box.w ? `${box.w}px` : '100%',
      transform: 'translate(-50%, -50%) rotate(90deg)',
      touchAction: 'none',
    }
    : { width: '100%', height: '100%', display: 'block', touchAction: 'none' };

  return (
    <div>
      {value ? (
        <button
          type="button"
          onClick={openSheet}
          disabled={disabled}
          className="w-full border border-[#e2e8f0] rounded-xl overflow-hidden bg-white block disabled:opacity-60"
        >
          <img src={value} alt="Seller signature" className="w-full object-contain" style={{ height }} />
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          disabled={disabled}
          style={{ height }}
          className="w-full border-2 border-dashed border-[#002395]/30 rounded-xl bg-white flex flex-col items-center justify-center disabled:opacity-60"
        >
          <i className="fas fa-signature text-2xl text-[#002395]/40"></i>
          <p className="text-xs text-gray-500 mt-1.5 font-bold">Tap to sign</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Opens a full screen signing area</p>
        </button>
      )}

      {value && !disabled && (
        <button type="button" onClick={openSheet} className="mt-2 text-xs font-bold text-[#002395]">
          <i className="fas fa-pen mr-1"></i>Replace signature
        </button>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-[70] bg-[#0f172a]/95 flex flex-col">

          <div className="flex-shrink-0 bg-[#002395] px-4 py-3 flex items-center justify-between">
            <p className="text-white font-semibold text-sm">Seller's signature</p>
            <div className="flex items-center gap-1">
              {strokeCount === 0 && (
                <button
                  type="button"
                  onClick={toggleRotation}
                  className="text-white/90 text-xs font-bold px-2 py-1 rounded"
                >
                  <i className="fas fa-rotate mr-1"></i>{rotated ? 'Upright' : 'Sideways'}
                </button>
              )}
              <button type="button" onClick={cancelSheet} className="text-white p-1 rounded" aria-label="Cancel signing">
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 p-3">
            <div ref={attachBox} className="relative w-full h-full bg-white rounded-2xl overflow-hidden">
              <canvas
                ref={attachCanvas}
                style={canvasStyle}
                onPointerDown={startStroke}
                onPointerMove={extendStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
              />
              {strokeCount === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <i className={`fas fa-signature text-3xl text-gray-200 ${rotated ? 'rotate-90' : ''}`}></i>
                  <p className="text-sm text-gray-400 mt-2">Sign here</p>
                  <p className="text-[11px] text-gray-300 mt-1 px-6 text-center">
                    {rotated
                      ? 'Signing sideways for more room - tap Upright to change'
                      : 'Tap Sideways for a longer signing line'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 px-3 pb-safe pt-1 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!strokeCount}
                className="flex-1 bg-white/10 border border-white/20 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-40"
              >
                <i className="fas fa-rotate-left mr-1.5"></i>Undo last
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={!strokeCount}
                className="flex-1 bg-white/10 border border-white/20 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-40"
              >
                <i className="fas fa-eraser mr-1.5"></i>Clear all
              </button>
            </div>
            <button
              type="button"
              onClick={saveSheet}
              className="w-full bg-green-600 text-white rounded-xl py-3.5 text-sm font-bold"
            >
              <i className="fas fa-check mr-1.5"></i>Save signature
            </button>
          </div>

          {confirmClear && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6">
              <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
                <h3 className="text-base font-bold text-[#0f172a]">Erase the whole signature?</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  This removes every stroke. To take back just the last letter, use Undo instead.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-bold"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="flex-1 bg-[#ED2939] text-white rounded-xl py-2.5 text-sm font-bold"
                  >
                    Erase all
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SignaturePad;
