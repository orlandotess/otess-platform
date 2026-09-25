// Búsqueda del catálogo por palabras sueltas en vez de por la frase literal.
//
// Antes se hacía `campo.includes(query)` con la consulta entera, así que
// "keypad touch" no encontraba "KeyPad Jeweller Touch" — las palabras están
// las dos, pero no seguidas. Eso obligaba a recordar la forma exacta del
// nombre, que es justo lo que el buscador debería evitar.
//
// Ahora todas las palabras tienen que aparecer, en cualquier orden y en
// cualquiera de los tres campos (nombre, descripción o código).
//
// El código además se compara sin espacios ni guiones: "EC100" y "EC-100"
// encuentran "Ec 100", que así es como está guardado.
export function matchesCatalogQuery(item, query) {
  const words = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${item?.name ?? ''} ${item?.description ?? ''} ${item?.item_code ?? ''}`.toLowerCase();
  if (words.every(word => haystack.includes(word))) return true;
  const code = compactCode(query);
  return code !== '' && compactCode(item?.item_code).includes(code);
}

function compactCode(value) {
  return (value ?? '').toLowerCase().replace(/[\s\-_.]+/g, '');
}

// Ordena los resultados para que el código escrito salga arriba: primero el
// código exacto, luego los que empiezan así, luego los que lo contienen, y
// al final los que solo coinciden por descripción. Sin esto, "EC" coincide
// con 40+ descripciones ("connectors", "electric"…) y "Ec 100" quedaba
// fuera de los primeros CATALOG_RESULT_LIMIT. El sort es estable, así que
// dentro de cada grupo se respeta el orden que ya traían.
export function rankCatalogMatches(matches, query) {
  const code = compactCode(query);
  if (code === '') return matches;
  const rank = item => {
    const c = compactCode(item?.item_code);
    if (c === code) return 0;
    if (c.startsWith(code)) return 1;
    if (c.includes(code)) return 2;
    return 3;
  };
  return [...matches].sort((a, b) => rank(a) - rank(b));
}

// Tope de resultados mostrados. Los llamadores comparan contra el total sin
// recortar para poder avisar de que hay más.
export const CATALOG_RESULT_LIMIT = 20;
