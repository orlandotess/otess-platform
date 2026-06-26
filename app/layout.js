import './globals.css';

export const metadata = {
  title: 'OTESS Platform',
  description: 'OT Electrical and Security Solutions — Plataforma interna',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
