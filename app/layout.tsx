import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/ui/Navigation';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Outpost - Network Health Monitor',
  description: 'Docker-based home network health monitoring',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-black text-gray-100 selection:bg-blue-500/30`}>
        <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-gray-950/50 to-gray-950 pointer-events-none" />
        <Navigation />
        <main className="container mx-auto px-4 py-6 relative">{children}</main>
      </body>
    </html>
  );
}
