import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

// Client for browser and client components (uses anon key + user session)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client for server components only (bypasses RLS)
// Only use this in page.js files, never in 'use client' components
export const supabaseServer = typeof window === 'undefined'
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey)
  : createClient(supabaseUrl, supabaseAnonKey);
