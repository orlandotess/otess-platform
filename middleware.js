import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) { response.cookies.set({ name, value, ...options }); },
        remove(name, options) { response.cookies.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Check admin-only routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
