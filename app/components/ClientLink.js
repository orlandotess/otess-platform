import Link from 'next/link';

// El nombre del cliente como enlace a su ficha. Se ve igual que el texto que
// reemplaza (hereda color y peso) y solo se subraya al pasar el mouse, para que
// las listas no se llenen de enlaces de color. Sin id o sin nombre pinta
// `empty` (por defecto, el nombre tal cual o nada).
export default function ClientLink({ clientId, name, empty, style }) {
  if (!name) return empty ?? null;
  if (!clientId) return empty ?? name;
  return (
    <Link href={`/clientes/${clientId}`} className="link-quiet" style={style}>
      {name}
    </Link>
  );
}
