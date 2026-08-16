/**
 * Pharmacy route layout.
 *
 * Usage: Applies capability bootstrap gating to all /pharmacy/* pages.
 * Inputs: React children from nested pharmacy routes.
 */
import { PharmacyCapabilityGate } from './capability-gate';

export default function PharmacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PharmacyCapabilityGate>{children}</PharmacyCapabilityGate>;
}
