import { redirect } from 'next/navigation';

export default function BillingReceiptRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/transactions/receipts/${params.id}`);
}
