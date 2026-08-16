/**
 * Inventory route layout.
 *
 * Usage: Applies capability bootstrap gating to all /inventory/* pages.
 * Inputs: React children from nested inventory routes.
 */
import { InventoryCapabilityGate } from './capability-gate';

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InventoryCapabilityGate>{children}</InventoryCapabilityGate>;
}
