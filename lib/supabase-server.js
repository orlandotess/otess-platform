import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseServer } from './supabase';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
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
// always match auth.users.id — see proxy.js). Returns null if not logged in.
export async function getCurrentRole() {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabaseServer.from('profiles').select('role').eq('email', user.email).single();
  return profile?.role ?? null;
}

// Display name of the currently logged-in user, looked up by email (same reason
// as getCurrentRole). Returns null if not logged in or no profile match.
export async function getCurrentUserName() {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabaseServer.from('profiles').select('name').eq('email', user.email).single();
  return profile?.name ?? null;
}

// id + name of the currently logged-in user's profile row (same email lookup
// caveat as getCurrentRole). Returns null if not logged in or no profile match.
export async function getCurrentProfile() {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabaseServer.from('profiles').select('id, name').eq('email', user.email).single();
  return profile ?? null;
}
