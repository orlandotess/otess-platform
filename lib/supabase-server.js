import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseServer } from './supabase';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name, options) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

// Role of the currently logged-in user, looked up by email (profiles.id doesn't
// always match auth.users.id — see middleware.js). Returns null if not logged in.
export async function getCurrentRole() {
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabaseServer.from('profiles').select('role').eq('email', user.email).single();
  return profile?.role ?? null;
}

// Display name of the currently logged-in user, looked up by email (same reason
// as getCurrentRole). Returns null if not logged in or no profile match.
export async function getCurrentUserName() {
  const authClient = createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabaseServer.from('profiles').select('name').eq('email', user.email).single();
  return profile?.name ?? null;
}
