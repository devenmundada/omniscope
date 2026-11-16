import { redirect } from 'next/navigation';

// The old Trust Center showed placeholder bank connections; real data sources and security now live on /methodology.
export default function TrustPage() {
  redirect('/methodology');
}
