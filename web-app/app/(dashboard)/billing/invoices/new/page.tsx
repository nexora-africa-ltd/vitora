import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default function BillingNewInvoiceRedirect({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  redirect(`/transactions/invoices/new${qs ? `?${qs}` : ''}`);
}
