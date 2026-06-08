import { useState, useRef, useEffect, useMemo } from 'react';

const DOTS = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  cx: 25 + (index % 3) * 75,
  cy: 25 + Math.floor(index / 3) * 75,
}));

const PatternLock = ({ value = [], onChange, readOnly = false }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const pattern = useMemo(() => Array.isArray(value) ? value : [], [value]);
  const patternRef = useRef(pattern);
  const pointerIdRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  useEffect(() => {
    return () => {
      if (pointerIdRef.current) {
        document.releasePointerCapture?.(pointerIdRef.current);
      }
    };
  }, []);

  const getSVGCoords = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    
    const rect = svg.getBoundingClientRect();
    const scaleX = 200 / rect.width;
    const scaleY = 200 / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const getNearestDot = (x, y) => {
    let nearest = null;
    let minDist = 35; // Activation radius
    
    DOTS.forEach(({ id, cx, cy }) => {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < minDist && !patternRef.current.includes(id)) {
        minDist = dist;
        nearest = id;
      }
    });
    
    return nearest;
  };

  const addDotToPattern = (dotId) => {
    if (!dotId || patternRef.current.includes(dotId)) return;
    
    const newPattern = [...patternRef.current, dotId];
    patternRef.current = newPattern;
    onChange?.(newPattern);
  };

  const handlePointerStart = (event) => {
    if (readOnly) return;
    
    event.preventDefault();
    const coords = getSVGCoords(event.clientX, event.clientY);
    
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    
    setIsDrawing(true);
    setCurrentPos(coords);
    
    // Check if starting on a dot
    const startDot = getNearestDot(coords.x, coords.y);
    if (startDot) {
      addDotToPattern(startDot);
    }
  };

  const handlePointerMove = (event) => {
    if (readOnly || !isDrawing || event.pointerId !== pointerIdRef.current) return;
    
    event.preventDefault();
    const coords = getSVGCoords(event.clientX, event.clientY);
    
    setCurrentPos(coords);
    
    // Check for dots along the path
    const nearestDot = getNearestDot(coords.x, coords.y);
    if (nearestDot) {
      addDotToPattern(nearestDot);
    }
  };

  const handlePointerEnd = (event) => {
    if (readOnly || event.pointerId !== pointerIdRef.current) return;
    
    setIsDrawing(false);
    setCurrentPos({ x: 0, y: 0 });
    pointerIdRef.current = null;
  };

  const clearPattern = () => {
    if (readOnly) return;
    onChange?.([]);
  };

  const points = pattern.map(id => DOTS[id - 1]).filter(Boolean);
  
  // Create the path: connect all dots, then extend to current position if drawing
  const pathData = points.length > 0 ? 
    `M ${points.map(p => `${p.cx} ${p.cy}`).join(' L ')}${
      isDrawing ? ` L ${currentPos.x} ${currentPos.y}` : ''
    }` : '';

  return (
    <div className="w-full" style={{ touchAction: 'none', userSelect: 'none' }}>
      <p className="text-sm text-gray-500 text-center mb-3">
        {pattern.length === 0 
          ? 'Draw the unlock pattern' 
          : `Pattern recorded (${pattern.length} points)`}
      </p>
      
      <div
        className="bg-[#f0f4ff] rounded-2xl p-6 flex flex-col items-center justify-center relative"
        onPointerDown={handlePointerStart}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        <div style={{ width: '240px', height: '240px', position: 'relative' }}>
          <svg 
            ref={svgRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 200 200" 
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="#002395" />
              </marker>
            </defs>

            {/* Connecting segments */}
            {points.slice(0, -1).map((p, i) => {
              const next = points[i + 1];
              return (
                <line
                  key={i}
                  x1={p.cx}
                  y1={p.cy}
                  x2={next.cx}
                  y2={next.cy}
                  stroke="#002395"
                  strokeWidth="3"
                  opacity="0.8"
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {/* Dynamic line while drawing */}
            {isDrawing && points.length > 0 && (
              <line
                x1={points[points.length - 1].cx}
                y1={points[points.length - 1].cy}
                x2={currentPos.x}
                y2={currentPos.y}
                stroke="#002395"
                strokeWidth="3"
                opacity="0.6"
              />
            )}
            
            {/* Current position indicator */}
            {isDrawing && (
              <circle 
                cx={currentPos.x} 
                cy={currentPos.y} 
                r="8" 
                fill="#002395" 
                opacity="0.4"
              />
            )}
          </svg>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', height: '100%' }}>
            {DOTS.map(({ id }, index) => {
              const isSelected = pattern.includes(id);
              const isFirst = pattern[0] === id;
              const isLast = pattern.length > 1 && pattern[pattern.length - 1] === id;
              
              let bg = 'white';
              let border = '2px solid #D1D5DB';
              let textColor = '#6B7280';
              
              if (isSelected) {
                if (isFirst) {
                  bg = '#22C55E';
                  border = '2px solid #22C55E';
                } else if (isLast) {
                  bg = '#ED2939';
                  border = '2px solid #ED2939';
                } else {
                  bg = '#002395';
                  border = '2px solid #002395';
                }
                textColor = 'white';
              }
              
              return (
                <div
                  key={id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <div
                    className="flex items-center justify-center transition-all duration-200 shadow-sm"
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: bg,
                      border: border,
                      color: textColor,
                      fontSize: '16px',
                      fontWeight: 'bold',
                    }}
                  >
                    {id}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pattern.length > 0 && (
        <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',justifyContent:'center',gap:'4px',marginTop:'8px'}}>
          {pattern.map((dot, index) => {
            const isFirst = index === 0;
            const isLast = pattern.length > 1 && index === pattern.length - 1;
            const dotBg = isFirst ? '#22C55E' : isLast ? '#ED2939' : '#002395';
            
            return (
              <span key={dot} style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
                <span style={{
                  width: '24px', height: '24px',
                  borderRadius: '50%',
                  background: dotBg,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>{dot}</span>
                {index < pattern.length - 1 && (
                  <span style={{color:'#002395',fontWeight:'bold'}}>→</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {readOnly && pattern.length > 0 && (
        <p style={{fontSize:'10px',color:'#666',textAlign:'center',marginTop:'4px'}}>
          Start: {pattern[0]} → End: {pattern[pattern.length-1]} ({pattern.length} points)
        </p>
      )}
      
      {pattern.length > 0 && !readOnly && (
        <button
          type="button"
          onClick={clearPattern}
          className="mt-3 w-full bg-red-50 text-[#ED2939] rounded-xl py-2 text-sm font-semibold border border-red-100"
        >
          <i className="fas fa-redo mr-2"></i>Clear Pattern
        </button>
      )}
    </div>
  );
};

export default PatternLock;
