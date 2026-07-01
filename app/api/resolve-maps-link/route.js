export async function POST(req) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "URL requerida" }, { status: 400 });

  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const finalUrl = res.url;

    const coordPattern = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g;

    // Try the resolved URL first
    let matches = [...finalUrl.matchAll(coordPattern)];
    if (matches.length > 0) {
      const atMatch = finalUrl.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
      const chosen = atMatch ? atMatch : matches[matches.length - 1];
      return Response.json({ coords: `${chosen[1]}, ${chosen[2]}`, resolvedUrl: finalUrl });
    }

    // Fallback: fetch the HTML body and search for coordinates embedded in the page data
    const html = await res.text();
    const bodyMatches = [...html.matchAll(coordPattern)];
    if (bodyMatches.length > 0) {
      // Google often embeds [lat,lng] pairs early in the page data - take the first plausible one
      const chosen = bodyMatches[0];
      return Response.json({ coords: `${chosen[1]}, ${chosen[2]}`, resolvedUrl: finalUrl });
    }

    return Response.json({ error: "No se encontraron coordenadas", resolvedUrl: finalUrl });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
