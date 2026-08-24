import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const LOCALES = ['es', 'en'];
export const DEFAULT_LOCALE = 'es';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = LOCALES.includes(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
