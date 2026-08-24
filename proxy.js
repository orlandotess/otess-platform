import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = 'https://zisidorwdhrttmdppnbj.supabase.co';
const supabaseAnonKey = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn';

// Rutas públicas que no requieren sesión ni chequeo de rol
const PUBLIC_PATHS = ['/login', '/verify-code', '/forgot-password', '/reset-password', '/factura', '/estimado', '/propuesta', '/orden-cambio', '/reporte', '/reporte-boleto', '/reporte-mantenimiento', '/favicon.ico', '/otess-logo.png', '/otess-logo-blanco.png', '/otess-icon.png', '/api/login', '/api/logout', '/api/set-locale', '/api/send-verification-code', '/api/verify-code', '/api/forgot-password', '/api/send-invoice', '/api/send-estimate', '/api/send-report', '/api/send-ticket-report', '/api/recurring-invoices', '/api/recurring-expenses', '/api/recurring-maintenances', '/api/invoice-reminders', '/api/calendar-reminders', '/api/calendar/feed', '/api/backup-storage', '/api/propuestas/aprobar', '/api/ordenes-cambio/aprobar', '/api/paypal/create-order', '/api/paypal/capture-order', '/api/service-tickets/inbound'];

function isPublic(pathname) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Páginas públicas que ve directamente el cliente final (no el empleado que
// las generó) — factura/estimado/propuesta/orden de cambio y sus reportes.
// Por decisión del negocio, estas siempre se muestran en inglés,
// independientemente del idioma configurado en el navegador del empleado
// que las creó (ver lib/i18n-server.js para el mismo criterio aplicado a
// los emails que se les envían).
const CLIENT_FACING_PATHS = ['/factura', '/estimado', '/propuesta', '/orden-cambio', '/reporte', '/reporte-boleto', '/reporte-mantenimiento'];

function isClientFacing(pathname) {
  return CLIENT_FACING_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Rutas permitidas para el rol "tecnico" (todo lo demás redirige a /crew)
const TECNICO_ALLOWED = ['/crew', '/trabajos', '/clientes', '/planos', '/boletos'];

// Un técnico solo puede abrir el detalle de una solicitud específica (llegando
// desde la agenda del Crew App), no la lista completa ni "Nueva solicitud" —
// esas siguen siendo funciones de oficina/ventas.
const SOLICITUD_DETAIL_RE = /^\/solicitudes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rutas bloqueadas para el rol "vendedor" (redirige a /)
const VENDEDOR_BLOCKED = ['/accounting', '/admin/usuarios'];

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    if (isClientFacing(pathname)) {
      // No persistimos esto como cookie de respuesta — solo afecta cómo se
      // renderiza esta request puntual, sin tocar la cookie real del
      // navegador del cliente.
      request.cookies.set('NEXT_LOCALE', 'en');
      return NextResponse.next({ request });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch (err) {
    console.error('Middleware auth.getUser error:', err.message);
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  let role = 'tecnico';
  try {
    const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY_MW);
    // Buscamos por email en vez de id, porque hay perfiles cuyo id no coincide con auth.users.id
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('email', user.email)
      .single();
    if (profileError) console.error('Middleware profile lookup error:', profileError.message);
    role = profile?.role ?? 'tecnico';
  } catch (err) {
    console.error('Middleware role fetch exception:', err.message);
  }

  if (role === 'tecnico') {
    const allowed = TECNICO_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/')) || SOLICITUD_DETAIL_RE.test(pathname);
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/crew';
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
  // secretaria: sin restricciones

  if (role === 'admin') {
    const mfaId = request.cookies.get('otess_mfa_id')?.value;
    let mfaOk = false;
    if (mfaId) {
      try {
        const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY_MW);
        const { data: mfaRow } = await admin
          .from('login_verification_codes')
          .select('user_email, verified, verified_until')
          .eq('id', mfaId)
          .single();
        mfaOk = !!mfaRow && mfaRow.user_email === user.email && mfaRow.verified && new Date(mfaRow.verified_until) > new Date();
      } catch (err) {
        console.error('Middleware MFA check exception:', err.message);
      }
    }
    if (!mfaOk) {
      const url = request.nextUrl.clone();
      url.pathname = '/verify-code';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
