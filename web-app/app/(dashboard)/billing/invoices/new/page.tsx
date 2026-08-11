import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BillingNewInvoiceRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
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
