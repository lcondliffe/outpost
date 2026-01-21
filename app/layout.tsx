import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/ui/Navigation';

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
      <body className="min-h-screen bg-gray-950">
        <Navigation />
        <main className="container mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
