"use client";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

// Pestaña "Cable box" de Inventario: todas las cajas de cable
// (location_stock_reels) agrupadas por tipo de cable y, dentro de cada tipo,
// por ubicación — "x2 · Almacén › Estante 2 · quedan 1,450 de 2,000 pies".
// Solo lectura: las cajas se registran y se descuentan desde Crew App y Catálogo.
//
// El tipo de cable es el producto del catálogo de la caja. Para que dos cajas
// del mismo cable se cuenten juntas tienen que estar en el MISMO producto (con
// su número de caja en el código de la caja), no en un producto por caja.

const TYPE_ICON = { warehouse: "🏢", site: "📍", van: "🚐", zone: "🗂️", shelf: "📚", bin: "🗃️" };

function normalize(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function CableBoxList({ reels, locations }) {
  const t = useTranslations("inventario.cableBox");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const fmtFt = n => Number(n ?? 0).toLocaleString(locale === "en" ? "en-US" : "es-PR", { maximumFractionDigits: 0 });

  const byId = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations]);
  function pathOf(id) {
    const parts = [];
    let cur = byId[id];
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? byId[cur.parent_id] : null;
    }
    return parts.join(" › ");
  }

  const groups = useMemo(() => {
    const byType = new Map();
    for (const r of reels) {
      const ci = r.catalog_items ?? {};
      const typeKey = r.catalog_item_id ?? "__none__";
      if (!byType.has(typeKey)) {
        byType.set(typeKey, {
          key: typeKey,
          name: ci.name?.trim() || ci.description?.trim() || ci.item_code?.trim() || t("unnamed"),
          code: ci.item_code?.trim() || "",
          unnamed: !ci.name?.trim() && !ci.description?.trim(),
          byLocation: new Map(),
          count: 0, remaining: 0, total: 0,
        });
      }
      const g = byType.get(typeKey);
      const locKey = r.location_id ?? "__none__";
      if (!g.byLocation.has(locKey)) {
        const loc = byId[r.location_id];
        g.byLocation.set(locKey, { key: locKey, icon: TYPE_ICON[loc?.type] ?? "📦", path: loc ? pathOf(loc.id) : t("noLocation"), boxes: [], remaining: 0, total: 0 });
      }
      const lg = g.byLocation.get(locKey);
      lg.boxes.push(r);
      lg.remaining += Number(r.remaining_footage ?? 0);
      lg.total += Number(r.total_footage ?? 0);
      g.count += 1;
      g.remaining += Number(r.remaining_footage ?? 0);
      g.total += Number(r.total_footage ?? 0);
    }
    return [...byType.values()]
      .map(g => ({ ...g, locations: [...g.byLocation.values()].sort((a, b) => a.path.localeCompare(b.path, "es")) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reels, byId]);

  // Cada palabra tiene que aparecer en el tipo de cable, su código o alguna ubicación.
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const visible = words.length
    ? groups.filter(g => {
        const hay = normalize([g.name, g.code, ...g.locations.map(l => l.path), ...g.locations.flatMap(l => l.boxes.map(b => b.code))].filter(Boolean).join(" "));
        return words.every(w => hay.includes(w));
      })
    : groups;

  const totalBoxes = reels.length;

  return (
    <div style={{ background: "var(--surface)", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--navy)" }}>🧵 {t("title")}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("summary", { boxes: totalBoxes, types: groups.length })}</div>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>{t("subtitle")}</p>

      {totalBoxes > 0 && (
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("searchPlaceholder")}
          style={{ width: "100%", padding: "8px 10px", marginBottom: 14, border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }} />
      )}

      {totalBoxes === 0 ? (
        <div className="empty"><p>{t("empty")}</p></div>
      ) : visible.length === 0 ? (
        <div className="empty"><p>{t("noResults", { query })}</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visible.map(g => (
            <div key={g.key} style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", padding: "10px 14px", background: "var(--surface-2)" }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: g.unnamed ? "var(--warn)" : "var(--navy)" }}>{g.name}</span>
                  {g.code && g.code !== g.name && <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "monospace", marginLeft: 8 }}>{g.code}</span>}
                  {g.unnamed && <span style={{ fontSize: 11.5, color: "var(--warn)", marginLeft: 8 }}>· {t("noNameHint")}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {t("groupTotal", { count: g.count, remaining: fmtFt(g.remaining), total: fmtFt(g.total) })}
                </div>
              </div>
              {g.locations.map(l => (
                <div key={l.key} style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14 }}>
                      <span style={{ fontWeight: 800, color: "var(--amber)", marginRight: 8 }}>x{l.boxes.length}</span>
                      <span>{l.icon} {l.path}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{t("footage", { remaining: fmtFt(l.remaining), total: fmtFt(l.total) })}</div>
                  </div>
                  {l.boxes.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {l.boxes.map(b => (
                        <span key={b.id} style={{ fontSize: 11.5, color: "var(--muted)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 6 }}>
                          {b.code ? `${b.code} · ` : ""}{t("boxFootage", { remaining: fmtFt(b.remaining_footage), total: fmtFt(b.total_footage) })}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
