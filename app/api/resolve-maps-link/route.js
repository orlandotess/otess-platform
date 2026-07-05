const ALLOWED_HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'g.co'];

function isAllowedMapsUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function POST(req) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "URL requerida" }, { status: 400 });
  if (!isAllowedMapsUrl(url)) return Response.json({ error: "Solo se aceptan links de Google Maps" }, { status: 400 });

  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const finalUrl = res.url;

    const coordPattern = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g;
    // Google embeds the exact pin location as !3d{lat}!4d{lng}. The @lat,lng in the
    // URL is only the map viewport center, which Google shifts to keep the pin
    // visible next to the search panel - it can point far from the real location.
    const pinPattern = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/;

    function isPlausible(lat, lng) {
      const la = parseFloat(lat), ln = parseFloat(lng);
      return la >= -90 && la <= 90 && ln >= -180 && ln <= 180 && Math.abs(la) > 0.5 && Math.abs(ln) > 0.5;
    }

    // Try the resolved URL first
    const urlPinMatch = finalUrl.match(pinPattern);
    if (urlPinMatch && isPlausible(urlPinMatch[1], urlPinMatch[2])) {
      return Response.json({ coords: `${urlPinMatch[1]}, ${urlPinMatch[2]}`, resolvedUrl: finalUrl });
    }
    let matches = [...finalUrl.matchAll(coordPattern)].filter(m => isPlausible(m[1], m[2]));
    if (matches.length > 0) {
      const atMatch = finalUrl.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
      const chosen = (atMatch && isPlausible(atMatch[1], atMatch[2])) ? atMatch : matches[matches.length - 1];
      return Response.json({ coords: `${chosen[1]}, ${chosen[2]}`, resolvedUrl: finalUrl });
    }

    // Fallback: fetch the HTML body and search for coordinates embedded in the page data
    const html = await res.text();
    const bodyPinMatch = html.match(pinPattern);
    if (bodyPinMatch && isPlausible(bodyPinMatch[1], bodyPinMatch[2])) {
      return Response.json({ coords: `${bodyPinMatch[1]}, ${bodyPinMatch[2]}`, resolvedUrl: finalUrl });
    }
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
