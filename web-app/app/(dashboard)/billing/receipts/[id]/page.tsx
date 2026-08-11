import { redirect } from 'next/navigation';

export default async function BillingReceiptRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/transactions/receipts/${id}`);
}
