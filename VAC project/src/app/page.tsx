import Dashboard from './ui/dashboard';
export default async function Page({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  return <Dashboard initialStock={(await searchParams).market === 'US' ? 'apple' : 'reliance'} />;
}
