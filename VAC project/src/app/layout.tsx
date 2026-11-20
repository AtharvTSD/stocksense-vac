import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'StockSense | BMSCE VAC Pilot', description: 'End-of-day stock research with visible data provenance and experimental forecasts.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
