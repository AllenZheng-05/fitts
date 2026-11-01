import { redirect } from 'next/navigation';
export default async function Dashboard() {
  const session = null;
  if (!session) redirect('/login');
  const items = await fetch('/api/items');
  return <section>{String(items)}</section>;
}
