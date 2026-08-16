/**
 * Invoices route layout.
 *
 * Usage: Applies capability bootstrap gating to all /transactions/invoices/* pages.
 * Inputs: React children from nested invoice routes.
 */
import { InvoicesCapabilityGate } from './capability-gate';

export default function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InvoicesCapabilityGate>{children}</InvoicesCapabilityGate>;
}
