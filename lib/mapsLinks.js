// Builds correct Google/Apple/Waze links for an address that may be a plain
// street address, raw coordinates ("18.4337, -66.1137"), or a Google Plus Code.
// Property "street" fields can hold any of these (see ClientesDetail.js), so
// every place that links out to a map needs to handle all three the same way -
// blindly appending city/state/zip after coordinates or a URL sends the maps
// app a garbled, ambiguous query and opens the wrong location.

export function isMapsUrl(street) {
  return /^https?:\/\//i.test((street ?? '').trim());
}

export function buildMapsAddress(street, city, state, zip) {
  const s = (street ?? '').trim();
  const isCoords = /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/.test(s);
  const hasPlusCode = /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(s);
  return (isCoords || hasPlusCode) ? s : [street, city, state, zip].filter(Boolean).join(', ');
}

export function buildMapsLinks(street, city, state, zip) {
  if (isMapsUrl(street)) {
    return { direct: street };
  }
  const q = encodeURIComponent(buildMapsAddress(street, city, state, zip));
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    waze: `https://waze.com/ul?q=${q}`,
  };
}
