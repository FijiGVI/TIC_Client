import { redirect } from 'next/navigation';

export default function LegacyFormRequestPage() {
  redirect('/requests?new=1');
}
