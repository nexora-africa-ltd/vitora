import { redirect } from 'next/navigation';

export default async function BillingInvoiceDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/transactions/invoices/${id}`);
}
