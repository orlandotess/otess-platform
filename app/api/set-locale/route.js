import { NextResponse } from 'next/server';
import { LOCALES, LOCALE_COOKIE } from '../../../i18n/request';

export async function POST(request) {
  const { locale } = await request.json();
  if (!LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Locale inválido' }, { status: 400 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return response;
}
