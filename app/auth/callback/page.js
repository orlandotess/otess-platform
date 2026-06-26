import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';

export default async function AuthCallback({ searchParams }) {
  const code = searchParams?.code;

  if (code) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  redirect('/');
}
