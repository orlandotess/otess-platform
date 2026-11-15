import Link from 'next/link';

// El número de trabajo (JOB-…) como enlace al trabajo, con la misma pastilla
// ámbar que ya usa la ficha del cliente. Sin número no pinta nada (o `empty`).
export default function JobNumberLink({ jobId, jobNumber, empty = null, style }) {
  if (!jobNumber || !jobId) return empty;
  return (
    <Link
      href={`/trabajos/${jobId}`}
      style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', fontFamily: 'monospace', background: 'var(--amber-tint)', padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', textDecoration: 'none', ...style }}
    >
      {jobNumber}
    </Link>
  );
}
