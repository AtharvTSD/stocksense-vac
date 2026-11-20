import { notFound } from 'next/navigation';
import { companies } from '@/lib/pilot';
import Dashboard from '../../ui/dashboard';
export function generateStaticParams() { return companies.map(s => ({ id: s.id })); }
export const dynamicParams = false;
export default async function StockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stock = companies.find(s => s.id === id);
  if (!stock) notFound();
  return <Dashboard initialStock={stock.id} />;
}
