import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

// Client for browser (uses anon key + user session)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client for server (uses service role, bypasses RLS)
export const supabaseServer = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);
