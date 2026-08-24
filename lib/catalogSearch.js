// Búsqueda del catálogo por palabras sueltas en vez de por la frase literal.
//
// Antes se hacía `campo.includes(query)` con la consulta entera, así que
// "keypad touch" no encontraba "KeyPad Jeweller Touch" — las palabras están
// las dos, pero no seguidas. Eso obligaba a recordar la forma exacta del
// nombre, que es justo lo que el buscador debería evitar.
//
// Ahora todas las palabras tienen que aparecer, en cualquier orden y en
// cualquiera de los tres campos (nombre, descripción o código).
export function matchesCatalogQuery(item, query) {
  const words = (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${item?.name ?? ''} ${item?.description ?? ''} ${item?.item_code ?? ''}`.toLowerCase();
  return words.every(word => haystack.includes(word));
}

// Tope de resultados mostrados. Los llamadores comparan contra el total sin
// recortar para poder avisar de que hay más.
export const CATALOG_RESULT_LIMIT = 20;
