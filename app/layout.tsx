import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Noir House | Hotel Operations',
  description: 'A refined real-time operations and messaging dashboard for luxury hotel teams.',
  openGraph: {
    title: 'Noir House | Hotel Operations',
    description: 'A refined real-time operations and messaging dashboard for luxury hotel teams.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Noir House | Hotel Operations',
    description: 'A refined real-time operations and messaging dashboard for luxury hotel teams.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
