import { redirect } from 'next/navigation';

export default function BillingSHAClaimsRedirect() {
  redirect('/transactions/sha-claims');
}
