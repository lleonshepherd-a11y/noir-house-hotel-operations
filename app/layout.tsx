import type { Metadata } from 'next';
import { Manrope, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Manrope({
  variable: '--font-geist-sans',
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
