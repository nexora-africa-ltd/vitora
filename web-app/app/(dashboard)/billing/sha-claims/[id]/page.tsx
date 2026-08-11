import { redirect } from 'next/navigation';

export default async function BillingSHAClaimDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/transactions/sha-claims/${id}`);
}
