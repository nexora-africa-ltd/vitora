'use client';

import {
  MapPin,
  Calendar,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { parseISO, isPast } from 'date-fns';

/**
 * DHA Registry Result Card — renders the full DHA facility record.
 *
 * Accepts either a raw DHA API response (`Record<string, unknown>`) or
 * pre-extracted fields from the Facility model's cached DHA columns.
 *
 * Used by:
 *  - `/admin/facility-lookup` (raw DHA response)
 *  - `/admin/facilities/[id]` (cached fields merged into the same shape)
 */
export function DhaResultCard({ data }: { data: Record<string, unknown> }) {
  const name = (data.officialName ?? data.name ?? '') as string;
  const fidCode = (data.fidCode ?? '') as string;
  const frCode = (data.frCode ?? '') as string;
  const registrationNumber = (data.registrationNumber ?? '') as string;
  const facilityType = (data.facilityType ?? '') as string;
  const kephLevel = (data.kephLevel ?? '') as string;
  const contractStatus = (data.shaContractStatus ?? '') as string;
  const contractStart = (data.shaConstractStartDate ?? '') as string;
  const contractEnd = (data.shaConstractEndDate ?? '') as string;
  const services = (data.shaContractedServices ?? []) as string[];
  const licenseStatus = (data.facilityLicenseStatus ?? '') as string;
  const licenseNumber = (data.licenseNumber ?? '') as string;
  const licenseStart = (data.facilityLicenseStartDate ?? '') as string;
  const licenseEnd = (data.facilityLicenseEndDate ?? '') as string;
  const ownership = (data.facilityOwnership ?? '') as string;
  const regulator = (data.regulatoryBody ?? '') as string;
  const pcnCode = (data.pcnCode ?? '') as string;
  const isHub = data.isHub as boolean | undefined;

  // Facility contact
  const facilityPhone = (data.facilityPhoneNumber ?? '') as string;
  const facilityEmail = (data.facilityEmail ?? '') as string;

  // Administrator (separate from facility contact)
  const adminName = (data.facilityAdministratorName ?? '') as string;
  const adminEmail = (data.facilityAdministratorEmail ?? '') as string;
  const adminPhone = (data.facilityAdministratorPhone ?? '') as string;
  const adminId = (data.facilityAdministratorIdentifier ?? '') as string;

  // Address
  const address = (data.address ?? {}) as Record<string, string>;
  const county = address.county ?? '';
  const subCounty = address.subCounty ?? '';
  const physicalLocation = address.physicalLocation ?? '';
  const postalAddress = address.postalAddress ?? '';
  const town = address.town ?? '';
  const latitude = address.latitude ?? '';
  const longitude = address.longitude ?? '';

  // Bed occupancy
  const beds = (data.bedOccupancy ?? {}) as Record<string, number>;
  const totalBeds = beds.totalBeds ?? 0;
  const normalBeds = beds.normalBeds ?? 0;
  const icuBeds = beds.icuBeds ?? 0;
  const hduBeds = beds.hduBeds ?? 0;
  const dialysisBeds = beds.dialysisBeds ?? 0;
  const cots = beds.numberOfCots ?? 0;
  const hasBedData = totalBeds > 0 || normalBeds > 0 || icuBeds > 0 || hduBeds > 0 || dialysisBeds > 0 || cots > 0;

  // Operational status
  const regOps = (data.regulatoryOperationalStatus ?? {}) as Record<string, string>;
  const operationalStatus = regOps.operationalStatus ?? '';
  const operationalReason = regOps.operationalStatusReason ?? '';
  const suspensionReason = regOps.suspensionReason ?? '';

  const shaOps = (data.SHAOperationStatus ?? {}) as Record<string, string>;
  const shaOperationalStatus = shaOps.operationalStatus ?? '';

  const isLicenseExpired = licenseEnd
    ? isPast(parseISO(licenseEnd.split(' ')[0] ?? licenseEnd))
    : false;

  const fmtDate = (d: string) => (d ? d.split(' ')[0] : '');

  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg text-blue-700 dark:text-blue-300">
            DHA Registry
          </CardTitle>
          {fidCode && (
            <Badge variant="outline" className="ml-auto text-blue-600 border-blue-600">
              FID: {fidCode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name & Type */}
        {name && (
          <div>
            <h3 className="font-semibold text-lg">{name}</h3>
            {facilityType && <p className="text-sm text-muted-foreground">{facilityType}</p>}
          </div>
        )}

        {/* Core Identifiers & Details */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {frCode && (
            <div>
              <Label className="text-muted-foreground text-xs">FR Code</Label>
              <p className="font-medium">{frCode}</p>
            </div>
          )}
          {registrationNumber && (
            <div>
              <Label className="text-muted-foreground text-xs">Registration No.</Label>
              <p className="font-medium">{registrationNumber}</p>
            </div>
          )}
          {kephLevel && (
            <div>
              <Label className="text-muted-foreground text-xs">KEPH Level</Label>
              <p className="font-medium">{kephLevel}</p>
            </div>
          )}
          {county && (
            <div>
              <Label className="text-muted-foreground text-xs">Location</Label>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <p className="font-medium">{county}</p>
              </div>
              {subCounty && <p className="text-xs text-muted-foreground">{subCounty}</p>}
              {physicalLocation && <p className="text-xs text-muted-foreground truncate">{physicalLocation}</p>}
            </div>
          )}
          {operationalStatus && (
            <div>
              <Label className="text-muted-foreground text-xs">Regulatory Status</Label>
              <Badge
                variant={operationalStatus === 'ACTIVE' ? 'default' : 'secondary'}
                className="mt-1"
              >
                {operationalStatus}
              </Badge>
              {operationalReason && <p className="text-xs text-muted-foreground mt-0.5">{operationalReason}</p>}
              {suspensionReason && <p className="text-xs text-red-600 mt-0.5">{suspensionReason}</p>}
            </div>
          )}
          {shaOperationalStatus && (
            <div>
              <Label className="text-muted-foreground text-xs">SHA Status</Label>
              <Badge
                variant={shaOperationalStatus === 'ACTIVE' ? 'default' : 'secondary'}
                className="mt-1"
              >
                {shaOperationalStatus}
              </Badge>
            </div>
          )}
          {ownership && (
            <div>
              <Label className="text-muted-foreground text-xs">Ownership</Label>
              <p className="font-medium">{ownership}</p>
            </div>
          )}
          {regulator && (
            <div>
              <Label className="text-muted-foreground text-xs">Regulator</Label>
              <p className="font-medium uppercase">{regulator}</p>
            </div>
          )}
          {pcnCode && (
            <div>
              <Label className="text-muted-foreground text-xs">PCN Code</Label>
              <p className="font-medium">{pcnCode}</p>
            </div>
          )}
          {isHub !== undefined && (
            <div>
              <Label className="text-muted-foreground text-xs">Hub Facility</Label>
              <p className="font-medium">{isHub ? 'Yes' : 'No'}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Licensing */}
        <div>
          <Label className="text-muted-foreground text-xs font-semibold">Licensing</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-2">
            {licenseStatus && (
              <div>
                <Label className="text-muted-foreground text-xs">License Status</Label>
                <Badge
                  variant={licenseStatus === 'LICENSED' ? 'default' : 'secondary'}
                  className={cn('mt-1', licenseStatus === 'LICENSED' && 'bg-green-600')}
                >
                  {licenseStatus}
                </Badge>
                {licenseNumber && <p className="text-xs text-muted-foreground mt-0.5">#{licenseNumber}</p>}
              </div>
            )}
            {licenseStart && (
              <div>
                <Label className="text-muted-foreground text-xs">License Start</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{fmtDate(licenseStart)}</span>
                </div>
              </div>
            )}
            {licenseEnd && (
              <div>
                <Label className="text-muted-foreground text-xs">License Expiry</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className={cn('font-medium', isLicenseExpired && 'text-red-600')}>
                    {fmtDate(licenseEnd)}
                  </span>
                </div>
                {isLicenseExpired && <p className="text-xs text-red-600">Expired</p>}
              </div>
            )}
          </div>
        </div>

        {/* SHA Contract */}
        {(contractStatus || contractStart || contractEnd) && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">SHA Contract</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-2">
                <div>
                  <Label className="text-muted-foreground text-xs">Contract Status</Label>
                  <Badge
                    variant={contractStatus && contractStatus.toLowerCase().includes('active') ? 'default' : 'secondary'}
                    className="mt-1"
                  >
                    {contractStatus || 'Not Contracted'}
                  </Badge>
                </div>
                {contractStart && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Contract Start</Label>
                    <p className="font-medium">{fmtDate(contractStart)}</p>
                  </div>
                )}
                {contractEnd && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Contract End</Label>
                    <p className="font-medium">{fmtDate(contractEnd)}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Bed Occupancy */}
        {hasBedData && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">Bed Capacity</Label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm mt-2">
                {totalBeds > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{totalBeds}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                )}
                {normalBeds > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{normalBeds}</p>
                    <p className="text-xs text-muted-foreground">Normal</p>
                  </div>
                )}
                {icuBeds > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{icuBeds}</p>
                    <p className="text-xs text-muted-foreground">ICU</p>
                  </div>
                )}
                {hduBeds > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{hduBeds}</p>
                    <p className="text-xs text-muted-foreground">HDU</p>
                  </div>
                )}
                {dialysisBeds > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{dialysisBeds}</p>
                    <p className="text-xs text-muted-foreground">Dialysis</p>
                  </div>
                )}
                {cots > 0 && (
                  <div className="text-center p-2 rounded-md bg-background/50">
                    <p className="text-lg font-bold">{cots}</p>
                    <p className="text-xs text-muted-foreground">Cots</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Address */}
        {(postalAddress || town || (latitude && longitude)) && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">Address</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-2">
                {postalAddress && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Postal Address</Label>
                    <p className="font-medium">{postalAddress}</p>
                  </div>
                )}
                {town && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Town</Label>
                    <p className="font-medium">{town}</p>
                  </div>
                )}
                {latitude && longitude && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Coordinates</Label>
                    <p className="font-medium">{latitude}, {longitude}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Facility Contact */}
        {(facilityPhone || facilityEmail) && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">Facility Contact</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-2">
                {facilityPhone && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Phone</Label>
                    <p className="font-medium">{facilityPhone}</p>
                  </div>
                )}
                {facilityEmail && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="font-medium truncate">{facilityEmail}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Administrator */}
        {(adminName || adminPhone || adminEmail || adminId) && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">Administrator</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mt-2">
                {adminName && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Name</Label>
                    <p className="font-medium">{adminName}</p>
                  </div>
                )}
                {adminPhone && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Phone</Label>
                    <p className="font-medium">{adminPhone}</p>
                  </div>
                )}
                {adminEmail && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Email</Label>
                    <p className="font-medium truncate">{adminEmail}</p>
                  </div>
                )}
                {adminId && (
                  <div>
                    <Label className="text-muted-foreground text-xs">ID Number</Label>
                    <p className="font-medium">{adminId}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Contracted Services */}
        {services.length > 0 && (
          <>
            <Separator />
            <div>
              <Label className="text-muted-foreground text-xs font-semibold">Contracted Services</Label>
              <div className="flex flex-wrap gap-1 mt-2">
                {services.map((service, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {service}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
