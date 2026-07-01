export async function POST(req) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "URL requerida" }, { status: 400 });

  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const finalUrl = res.url;

    const coordPattern = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g;

    function isPlausible(lat, lng) {
      const la = parseFloat(lat), ln = parseFloat(lng);
      return la >= -90 && la <= 90 && ln >= -180 && ln <= 180 && Math.abs(la) > 0.5 && Math.abs(ln) > 0.5;
    }

    // Try the resolved URL first
    let matches = [...finalUrl.matchAll(coordPattern)].filter(m => isPlausible(m[1], m[2]));
    if (matches.length > 0) {
      const atMatch = finalUrl.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
      const chosen = (atMatch && isPlausible(atMatch[1], atMatch[2])) ? atMatch : matches[matches.length - 1];
      return Response.json({ coords: `${chosen[1]}, ${chosen[2]}`, resolvedUrl: finalUrl });
    }

    // Fallback: fetch the HTML body and search for coordinates embedded in the page data
    const html = await res.text();
    const bodyMatches = [...html.matchAll(coordPattern)].filter(m => isPlausible(m[1], m[2]));
    if (bodyMatches.length > 0) {
      const chosen = bodyMatches[0];
      return Response.json({ coords: `${chosen[1]}, ${chosen[2]}`, resolvedUrl: finalUrl });
    }

    return Response.json({ error: "No se encontraron coordenadas", resolvedUrl: finalUrl });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
