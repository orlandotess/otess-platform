import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

// Rutas públicas que no requieren sesión ni chequeo de rol
const PUBLIC_PATHS = ['/login', '/factura', '/favicon.ico', '/otess-logo.png', '/api/send-invoice'];

function isPublic(pathname) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Rutas permitidas para el rol "tecnico" (todo lo demás redirige a /field)
const TECNICO_ALLOWED = ['/field', '/trabajos', '/clientes'];

// Rutas bloqueadas para el rol "vendedor" (redirige a /)
const VENDEDOR_BLOCKED = ['/accounting', '/admin/usuarios'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Buscar el rol del usuario (usa variable no-sensible, disponible en Edge Runtime)
  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY_MW);
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).single();

  if (profileError) {
    console.error('Middleware profile lookup error:', profileError.message);
  }

  const role = profile?.role ?? 'tecnico';

  if (role === 'tecnico') {
    const allowed = TECNICO_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/field';
      return NextResponse.redirect(url);
    }
  } else if (role === 'vendedor') {
    const blocked = VENDEDOR_BLOCKED.some(p => pathname === p || pathname.startsWith(p + '/'));
    if (blocked) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }
  // admin y secretaria: sin restricciones

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
