'use client';
import { useCallback, useRef } from 'react';

// AOC (Area of Coverage / FOV cone) geometry.
// direction is measured directly in SVG angle terms: 0°=right/east, 90°=down/south
// (SVG's y-axis already points down, so no offset is needed — cos/sin of the
// direction angle map straight onto dx/dy).

const deg2rad = d => (d * Math.PI) / 180;

function conePath(cx, cy, direction, fovAngle, radius) {
  if (fovAngle >= 360) {
    return `M ${cx} ${cy} m ${-radius} 0 a ${radius} ${radius} 0 1 1 ${radius * 2} 0 a ${radius} ${radius} 0 1 1 ${-radius * 2} 0`;
  }

  const centerRad = deg2rad(direction);
  const halfRad = deg2rad(fovAngle / 2);

  const startRad = centerRad - halfRad;
  const endRad = centerRad + halfRad;

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArc = fovAngle > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function tipPoint(cx, cy, direction, radius) {
  const rad = deg2rad(direction);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function edgePoints(cx, cy, direction, fovAngle, radius) {
  const centerRad = deg2rad(direction);
  const halfRad = deg2rad(fovAngle / 2);
  return {
    left: { x: cx + radius * Math.cos(centerRad - halfRad), y: cy + radius * Math.sin(centerRad - halfRad) },
    right: { x: cx + radius * Math.cos(centerRad + halfRad), y: cy + radius * Math.sin(centerRad + halfRad) },
  };
}

/**
 * AOCCone — renders a camera/AP Field-of-View cone in SVG with 3 interactive
 * handles, shown only when `selected` is true:
 *   ○ tip handle     → drag to rotate direction + change radius
 *   ◇ edge handles   → drag to widen/narrow the FOV angle
 */
export default function AOCCone({ cx, cy, aoc, onChange, svgScale = 1, selected = false }) {
  if (!aoc.visible) return null;

  const { direction, angle: fovAngle, radius, color, opacity } = aoc;

  const dragging = useRef(null);
  const gRef = useRef(null);

  const toSVGPoint = useCallback(e => {
    const svgEl = gRef.current?.ownerSVGElement;
    if (!svgEl) return { x: e.clientX, y: e.clientY };
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // ── Tip handle: controls direction + radius ──────────────────────────────
  const onTipPointerDown = useCallback(e => {
    e.stopPropagation();
    dragging.current = 'tip';
    e.target.setPointerCapture(e.pointerId);
  }, []);

  const onTipPointerMove = useCallback(e => {
    if (dragging.current !== 'tip') return;
    const { x, y } = toSVGPoint(e);
    const dx = x - cx;
    const dy = y - cy;
    const newRadius = Math.max(20, Math.sqrt(dx * dx + dy * dy));
    const newDir = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    onChange({ direction: newDir, radius: newRadius });
  }, [cx, cy, onChange, toSVGPoint]);

  const onTipPointerUp = useCallback(e => {
    dragging.current = null;
    e.target.releasePointerCapture(e.pointerId);
  }, []);

  // ── Edge handles: control FOV angle ───────────────────────────────────────
  const onEdgePointerDown = useCallback(side => e => {
    e.stopPropagation();
    dragging.current = side;
    e.target.setPointerCapture(e.pointerId);
  }, []);

  const onEdgePointerMove = useCallback(side => e => {
    if (dragging.current !== side) return;
    const { x, y } = toSVGPoint(e);
    const dx = x - cx;
    const dy = y - cy;
    const ptrAngle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const delta = ((ptrAngle - direction + 180 + 360) % 360) - 180;
    let newFov = Math.abs(delta) * 2;
    newFov = Math.max(5, Math.min(360, newFov));
    onChange({ angle: newFov });
  }, [cx, cy, direction, onChange, toSVGPoint]);

  const onEdgePointerUp = useCallback(side => e => {
    dragging.current = null;
    e.target.releasePointerCapture(e.pointerId);
  }, []);

  const path = conePath(cx, cy, direction, fovAngle, radius);
  const tip = tipPoint(cx, cy, direction, radius);
  const edges = edgePoints(cx, cy, direction, fovAngle, radius);

  // Handle display sizes stay ~constant on screen across zoom levels.
  const handleR = Math.max(8, 10 * svgScale);
  const diamondSize = Math.max(7, 9 * svgScale);

  function diamond(x, y) {
    return `${x},${y - diamondSize} ${x + diamondSize},${y} ${x},${y + diamondSize} ${x - diamondSize},${y}`;
  }

  return (
    <g ref={gRef} style={{ pointerEvents: selected ? 'all' : 'none' }}>
      <path
        d={path}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeOpacity={opacity * 0.8}
        strokeWidth={1}
        style={{ pointerEvents: 'visibleFill', cursor: 'pointer' }}
      />

      {selected && (
        <>
          <line
            x1={cx} y1={cy} x2={tip.x} y2={tip.y}
            stroke="white" strokeWidth={1.5} strokeDasharray="4 3"
            style={{ pointerEvents: 'none' }}
          />

          <circle
            cx={tip.x} cy={tip.y} r={handleR}
            fill={color} stroke="white" strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={onTipPointerDown}
            onPointerMove={onTipPointerMove}
            onPointerUp={onTipPointerUp}
          />

          <polygon
            points={diamond(edges.left.x, edges.left.y)}
            fill="white" stroke={color} strokeWidth={1.5}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={onEdgePointerDown('left')}
            onPointerMove={onEdgePointerMove('left')}
            onPointerUp={onEdgePointerUp('left')}
          />

          <polygon
            points={diamond(edges.right.x, edges.right.y)}
            fill="white" stroke={color} strokeWidth={1.5}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={onEdgePointerDown('right')}
            onPointerMove={onEdgePointerMove('right')}
            onPointerUp={onEdgePointerUp('right')}
          />
        </>
      )}
    </g>
  );
}
