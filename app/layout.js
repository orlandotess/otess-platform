import './globals.css';

export const metadata = {
  title: 'OTESS Platform',
  description: 'OT Electrical and Security Solutions — Plataforma interna',
  manifest: '/manifest.json',
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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('otess-theme')==='dark'?'dark':'light';}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
