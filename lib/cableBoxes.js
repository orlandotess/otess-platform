// Reglas de las cajas de cable (location_stock_reels).
//
// Los patch cables no son cajas de cable: no se muestran en las listas de
// cajas (Inventario → Cable box y Crew App → Cajas de cable) aunque alguien
// los haya registrado como caja. Siguen guardados y se ven en el stock normal
// y en Catálogo. Se reconocen por "patch" en el nombre, la descripción o el
// código del producto.
export function isPatchCable(item) {
  return /patch/i.test([item?.name, item?.description, item?.item_code].filter(Boolean).join(' '));
}
