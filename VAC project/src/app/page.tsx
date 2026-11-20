import Dashboard from './ui/dashboard';
export default async function Page({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const stock = (await searchParams).market === 'US' ? 'apple' : 'reliance';
  return <Dashboard key={stock} initialStock={stock} />;
}
