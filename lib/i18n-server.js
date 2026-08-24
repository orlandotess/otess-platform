import { cookies } from 'next/headers';
import { createTranslator } from 'next-intl';
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE } from '../i18n/request';

// Locale of the employee whose browser triggered the current request (e.g.
// clicking "enviar factura"). Used for INTERNAL-facing emails/notifications
// (sent to staff, e.g. services@otesspr.com) — those follow the generating
// employee's own interface language. NOT used for client-facing emails, see
// CLIENT_EMAIL_LOCALE below.
export async function getServerLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  return LOCALES.includes(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

// Fixed locale for any email addressed to the client (invoices, estimates,
// proposals, change orders, payment/reminder requests, work reports, etc.)
// — a business decision, not derived from the sending employee's own locale
// or any per-client preference. Mirrors the same fixed-English rule applied
// to client-facing public pages in proxy.js's CLIENT_FACING_PATHS.
export const CLIENT_EMAIL_LOCALE = 'en';

export async function getEmailTranslator(locale, namespace) {
  const messages = (await import(`../messages/${locale}.json`)).default;
  return createTranslator({ locale, messages, namespace });
}

// Convenience wrapper for the common case: an email namespace that always
// goes to the client, always in CLIENT_EMAIL_LOCALE.
export async function getClientEmailTranslator(namespace) {
  return getEmailTranslator(CLIENT_EMAIL_LOCALE, namespace);
}
