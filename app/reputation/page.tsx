import { redirect } from 'next/navigation';

// The old reputation page used placeholder scores; the computed investor profile lives in Wealth DNA.
export default function ReputationPage() {
  redirect('/dna');
}
