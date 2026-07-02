import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function AuthCallback({ searchParams }) {
  const code = searchParams?.code;

  if (code) {
    try {
      const supabase = createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return (
          <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
            <h2>Error al procesar invitación</h2>
            <p>{error.message}</p>
            <a href="/login">Ir a login</a>
          </div>
        );
      }
    } catch (err) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2>Error inesperado</h2>
          <p>{err.message}</p>
          <a href="/login">Ir a login</a>
        </div>
      );
    }
  }

  redirect('/');
}
