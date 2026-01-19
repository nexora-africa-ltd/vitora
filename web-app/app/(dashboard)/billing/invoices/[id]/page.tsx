import { redirect } from 'next/navigation';

export default function BillingInvoiceDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/transactions/invoices/${params.id}`);
}
