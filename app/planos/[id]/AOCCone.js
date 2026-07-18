'use client';
import { useCallback, useEffect, useRef } from 'react';

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

function pointAt(cx, cy, direction, dist) {
  const rad = deg2rad(direction);
  return { x: cx + dist * Math.cos(rad), y: cy + dist * Math.sin(rad) };
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
 * AOCCone — renders a camera/AP Field-of-View cone in SVG with 4 interactive
 * handles, shown only when `selected` is true:
 *   ● radius handle (far tip)  → drag to extend/shrink the cone's length,
 *                                 projected onto the current aim direction
 *                                 so a slightly off-axis drag doesn't also
 *                                 rotate it
 *   ◎ rotate handle (mid-line) → drag to aim the cone (direction only)
 *   ◇ edge handles             → drag to widen/narrow the FOV angle
 *
 * Dragging tracks the pointer via window-level listeners (not just the
 * small handle's own onPointerMove) because Safari/iOS has long-standing
 * reliability issues with setPointerCapture on small SVG shapes — a fast
 * finger drag can slip off the element before capture "sticks", silently
 * dropping the gesture. setPointerCapture is still attempted (harmless,
 * helps where it works), but the window listeners are what actually make
 * the drag keep tracking.
 */
export default function AOCCone({ cx, cy, aoc, onChange, svgScale = 1, selected = false }) {
  const { direction, angle: fovAngle, radius, color, opacity, visible } = aoc;

  const gRef = useRef(null);
  const dragTypeRef = useRef(null);
  const directionRef = useRef(direction);
  useEffect(() => { directionRef.current = direction; }, [direction]);

  const toSVGPoint = useCallback(e => {
    const svgEl = gRef.current?.ownerSVGElement;
    if (!svgEl) return { x: e.clientX, y: e.clientY };
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handlePointerMove = useCallback(e => {
    const type = dragTypeRef.current;
    if (!type) return;
    const { x, y } = toSVGPoint(e);
    const dx = x - cx;
    const dy = y - cy;
    if (type === 'radius') {
      // Project the drag onto the current aim direction so moving off-axis
      // (e.g. a finger that drifts sideways) only changes length, never
      // silently rotates the cone.
      const dirRad = deg2rad(directionRef.current);
      const projected = dx * Math.cos(dirRad) + dy * Math.sin(dirRad);
      onChange({ radius: Math.max(20, projected) });
    } else if (type === 'rotate') {
      const newDir = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      onChange({ direction: newDir });
    } else {
      const ptrAngle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const delta = ((ptrAngle - directionRef.current + 180 + 360) % 360) - 180;
      let newFov = Math.abs(delta) * 2;
      newFov = Math.max(5, Math.min(360, newFov));
      onChange({ angle: newFov });
    }
  }, [cx, cy, onChange, toSVGPoint]);

  const endDrag = useCallback(() => {
    dragTypeRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [handlePointerMove]);

  const startDrag = useCallback(type => e => {
    e.stopPropagation();
    dragTypeRef.current = type;
    try { e.target.setPointerCapture(e.pointerId); } catch { /* best-effort only */ }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [handlePointerMove, endDrag]);

  // Drop any in-progress drag if the component unmounts mid-gesture
  // (e.g. the marker gets deselected or deleted while dragging).
  useEffect(() => () => endDrag(), [endDrag]);

  if (!visible) return null;

  const path = conePath(cx, cy, direction, fovAngle, radius);
  const tip = pointAt(cx, cy, direction, radius);
  const rotateHandlePos = pointAt(cx, cy, direction, Math.min(radius, Math.max(24, radius * 0.35)));
  const edges = edgePoints(cx, cy, direction, fovAngle, radius);

  // Handle display sizes stay ~constant on screen across zoom levels.
  // The invisible touch targets are deliberately larger than the visible
  // handle so a finger doesn't need pixel-perfect precision to grab one.
  const handleR = Math.max(8, 10 * svgScale);
  const handleTouchR = Math.max(18, 22 * svgScale);
  const rotateR = Math.max(6, 7 * svgScale);
  const rotateTouchR = Math.max(16, 20 * svgScale);
  const diamondSize = Math.max(8, 10 * svgScale);
  const diamondTouchR = Math.max(18, 22 * svgScale);

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

          {/* Radius handle — drag along the aim direction to stretch/shrink the cone's length */}
          <g style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={startDrag('radius')}>
            <circle cx={tip.x} cy={tip.y} r={handleTouchR} fill="transparent" />
            <circle cx={tip.x} cy={tip.y} r={handleR} fill={color} stroke="white" strokeWidth={2} style={{ pointerEvents: 'none' }} />
          </g>

          {/* Rotate handle — drag to aim the cone, radius stays put */}
          <g style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={startDrag('rotate')}>
            <circle cx={rotateHandlePos.x} cy={rotateHandlePos.y} r={rotateTouchR} fill="transparent" />
            <circle cx={rotateHandlePos.x} cy={rotateHandlePos.y} r={rotateR} fill="white" stroke={color} strokeWidth={2} style={{ pointerEvents: 'none' }} />
          </g>

          <g style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={startDrag('left')}>
            <circle cx={edges.left.x} cy={edges.left.y} r={diamondTouchR} fill="transparent" />
            <polygon points={diamond(edges.left.x, edges.left.y)} fill="white" stroke={color} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
          </g>

          <g style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={startDrag('right')}>
            <circle cx={edges.right.x} cy={edges.right.y} r={diamondTouchR} fill="transparent" />
            <polygon points={diamond(edges.right.x, edges.right.y)} fill="white" stroke={color} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
          </g>
        </>
      )}
    </g>
  );
}
