/**
 * Transactions → Bills
 * Redirects to the full supplier bills page
 */
import { redirect } from 'next/navigation';

export default function TransactionsBillsPage() {
  redirect('/transactions/supplier-bills');
}
