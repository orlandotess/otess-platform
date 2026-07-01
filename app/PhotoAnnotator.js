"use client";
import { useRef, useState, useEffect } from "react";

const COLORS = ["#e05c2a", "#e74c3c", "#27ae60", "#2a4cb5", "#f1c40f", "#ffffff", "#000000"];

export default function PhotoAnnotator({ imageUrl, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [tool, setTool] = useState("pen"); // pen | arrow | circle | text
  const [color, setColor] = useState("#e05c2a");
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [textInput, setTextInput] = useState(null); // { x, y }
  const [textValue, setTextValue] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const maxW = Math.min(window.innerWidth * 0.9, 900);
      const scale = Math.min(maxW / img.width, (window.innerHeight * 0.7) / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHistory([canvas.toDataURL()]);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function saveSnapshot() {
    const canvas = canvasRef.current;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  }

  function handleStart(e) {
    e.preventDefault();
    const pos = getPos(e);
    if (tool === "text") {
      setTextInput(pos);
      return;
    }
    setDrawing(true);
    setStartPos(pos);
    if (tool === "pen") {
      const ctx = canvasRef.current.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }

  function handleMove(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext("2d");

    if (tool === "pen") {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === "arrow" || tool === "circle") {
      // Redraw last snapshot then draw preview shape
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        if (tool === "circle") {
          const radius = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
          ctx.beginPath();
          ctx.arc(startPos.x, startPos.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else if (tool === "arrow") {
          drawArrow(ctx, startPos.x, startPos.y, pos.x, pos.y);
        }
      };
      img.src = history[history.length - 1];
    }
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const headlen = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function handleEnd() {
    if (!drawing) return;
    setDrawing(false);
    saveSnapshot();
  }

  function addText() {
    if (!textValue.trim() || !textInput) { setTextInput(null); setTextValue(""); return; }
    const ctx = canvasRef.current.getContext("2d");
    ctx.font = `${lineWidth * 6 + 12}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textValue, textInput.x, textInput.y);
    saveSnapshot();
    setTextInput(null);
    setTextValue("");
  }

  function undo() {
    if (history.length <= 1) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = newHistory[newHistory.length - 1];
  }

  function handleSave() {
    canvasRef.current.toBlob(blob => {
      onSave(blob);
    }, "image/jpeg", 0.92);
  }

  const toolBtn = (t, icon, label) => (
    <button onClick={() => setTool(t)} style={{
      padding: "8px 14px", borderRadius: 8, border: "2px solid", borderColor: tool === t ? "#16223d" : "#e5e7eb",
      background: tool === t ? "#16223d" : "#fff", color: tool === t ? "#fff" : "#16223d",
      fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
    }}>
      {icon} {label}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 3000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {toolBtn("pen", "✏️", "Lápiz")}
        {toolBtn("arrow", "➡️", "Flecha")}
        {toolBtn("circle", "⭕", "Círculo")}
        {toolBtn("text", "🔤", "Texto")}
        <button onClick={undo} style={{ padding: "8px 14px", borderRadius: 8, border: "2px solid #e5e7eb", background: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>↩️ Deshacer</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
            border: color === c ? "3px solid #e0972c" : "2px solid rgba(255,255,255,0.3)",
          }} />
        ))}
        <input type="range" min="2" max="12" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} style={{ marginLeft: 10, width: 80 }} />
      </div>

      <div style={{ position: "relative", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          style={{ display: "block", touchAction: "none", cursor: tool === "text" ? "text" : "crosshair" }}
        />
        {textInput && (
          <div style={{ position: "absolute", left: textInput.x, top: textInput.y - 20, display: "flex", gap: 6, background: "#fff", padding: 6, borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}>
            <input autoFocus value={textValue} onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addText()}
              style={{ border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 13, width: 140 }} placeholder="Texto..." />
            <button onClick={addText} style={{ background: "#16223d", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>OK</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={handleSave} style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>💾 Guardar</button>
        <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}
