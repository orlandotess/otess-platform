import './globals.css';

export const metadata = {
  title: 'OTESS Platform',
  description: 'OT Electrical and Security Solutions — Plataforma interna',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OTESS',
  },
  icons: {
    apple: '/otess-logo.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
