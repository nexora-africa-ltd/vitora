import { redirect } from 'next/navigation';

export default function BillingSHAClaimDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/transactions/sha-claims/${params.id}`);
}
