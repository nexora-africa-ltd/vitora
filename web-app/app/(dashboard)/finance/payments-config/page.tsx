/**
 * Payments Configuration Page
 *
 * Per-facility billing defaults, collection accounts, and M-Pesa API
 * credentials.  Creates a FacilityBillingConfig if one doesn't exist
 * for the current facility, otherwise loads and edits the existing one.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCent,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Save,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFacility } from '@/lib/context/facility-context';
import { billingApi } from '@/lib/api/billing';
import type {
  FacilityBillingConfig,
  FacilityBillingConfigUpdateData,
} from '@/lib/types/billing';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_TYPES = [
  { value: 'cash', label: 'Cash', requiresConfig: null },
  { value: 'mpesa', label: 'M-Pesa', requiresConfig: 'mpesa' as const },
  { value: 'insurance', label: 'Insurance', requiresConfig: null },
  { value: 'corporate', label: 'Corporate Account', requiresConfig: null },
  { value: 'mixed', label: 'Mixed Payment', requiresConfig: null },
  { value: 'bank_transfer', label: 'Bank Transfer', requiresConfig: 'bank' as const },
] as const;

const MPESA_ENVIRONMENTS = [
  { value: 'sandbox', label: 'Sandbox (Testing)' },
  { value: 'production', label: 'Production (Live)' },
] as const;

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  // Billing defaults
  default_payment_type: string;
  default_due_days: number;
  auto_finalize_on_checkout: boolean;
  tax_rate: string;
  // Collection accounts
  mpesa_paybill: string;
  mpesa_account_ref: string;
  bank_name: string;
  bank_account_number: string;
  bank_branch: string;
  // M-Pesa API credentials
  mpesa_consumer_key: string;
  mpesa_consumer_secret: string;
  mpesa_passkey: string;
  mpesa_shortcode: string;
  mpesa_callback_url: string;
  mpesa_environment: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

function configToForm(cfg: FacilityBillingConfig): FormState {
  return {
    default_payment_type: cfg.default_payment_type?.toLowerCase() ?? 'cash',
    default_due_days: cfg.default_due_days ?? 30,
    auto_finalize_on_checkout: cfg.auto_finalize_on_checkout ?? false,
    tax_rate: cfg.tax_rate ?? '0.00',
    mpesa_paybill: cfg.mpesa_paybill ?? '',
    mpesa_account_ref: cfg.mpesa_account_ref ?? '',
    bank_name: cfg.bank_name ?? '',
    bank_account_number: cfg.bank_account_number ?? '',
    bank_branch: cfg.bank_branch ?? '',
    mpesa_consumer_key: cfg.mpesa_consumer_key ?? '',
    mpesa_consumer_secret: cfg.mpesa_consumer_secret ?? '',
    mpesa_passkey: cfg.mpesa_passkey ?? '',
    mpesa_shortcode: cfg.mpesa_shortcode ?? '',
    mpesa_callback_url: cfg.mpesa_callback_url ?? '',
    mpesa_environment: cfg.mpesa_environment ?? 'sandbox',
  };
}

function formToPayload(form: FormState): FacilityBillingConfigUpdateData {
  return {
    default_payment_type: form.default_payment_type,
    default_due_days: form.default_due_days,
    auto_finalize_on_checkout: form.auto_finalize_on_checkout,
    tax_rate: form.tax_rate,
    mpesa_paybill: form.mpesa_paybill,
    mpesa_account_ref: form.mpesa_account_ref,
    bank_name: form.bank_name,
    bank_account_number: form.bank_account_number,
    bank_branch: form.bank_branch,
    mpesa_consumer_key: form.mpesa_consumer_key,
    mpesa_consumer_secret: form.mpesa_consumer_secret,
    mpesa_passkey: form.mpesa_passkey,
    mpesa_shortcode: form.mpesa_shortcode,
    mpesa_callback_url: form.mpesa_callback_url,
    mpesa_environment: form.mpesa_environment,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns true when the minimum required M-Pesa credentials are filled.
 *
 * Sandbox only requires consumer_key + consumer_secret (Safaricom provides
 * a shared shortcode 174379 and a public test passkey).
 * Production requires all four.
 */
function hasMpesaCredsInForm(f: FormState): boolean {
  const hasCore = !!(f.mpesa_consumer_key && f.mpesa_consumer_secret);
  if (f.mpesa_environment === 'production') {
    return hasCore && !!f.mpesa_shortcode && !!f.mpesa_passkey;
  }
  return hasCore;
}

/** Returns true when bank name + account number are filled. */
function hasBankDetailsInForm(f: FormState): boolean {
  return !!(f.bank_name && f.bank_account_number);
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};

  // --- General tab ---
  if (!form.default_payment_type) errors.default_payment_type = 'Required';
  if (!form.default_due_days || form.default_due_days < 1) errors.default_due_days = 'Must be at least 1 day';
  if (form.tax_rate === '' || isNaN(Number(form.tax_rate))) errors.tax_rate = 'Must be a valid number';

  // --- M-Pesa credentials ---
  // Core fields are always required when configuring M-Pesa
  const coreFields: (keyof FormState)[] = ['mpesa_consumer_key', 'mpesa_consumer_secret'];
  // Shortcode + passkey are only required in production (sandbox uses shared defaults)
  const prodOnlyFields: (keyof FormState)[] = ['mpesa_shortcode', 'mpesa_passkey'];
  const isProduction = form.mpesa_environment === 'production';
  const requiredMpesaFields = isProduction ? [...coreFields, ...prodOnlyFields] : coreFields;
  const allMpesaFields = [...coreFields, ...prodOnlyFields];

  const filledAny = allMpesaFields.some((k) => !!form[k]);
  if (filledAny) {
    for (const k of requiredMpesaFields) {
      if (!form[k]) {
        errors[k] = isProduction && prodOnlyFields.includes(k)
          ? 'Required for production environment'
          : 'Required when configuring M-Pesa credentials';
      }
    }
  }

  // Callback URL is required in production when credentials are set
  if (hasMpesaCredsInForm(form) && isProduction && !form.mpesa_callback_url) {
    errors.mpesa_callback_url = 'Required for production environment';
  }

  // --- Bank: all-or-nothing for name + account ---
  if (form.bank_name && !form.bank_account_number) {
    errors.bank_account_number = 'Required when bank name is provided';
  }
  if (!form.bank_name && form.bank_account_number) {
    errors.bank_name = 'Required when account number is provided';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Tiny helper components
// ---------------------------------------------------------------------------

/** Required asterisk */
function Req() {
  return <span className="text-destructive ml-0.5">*</span>;
}

/** Field error message */
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PaymentsConfigPage() {
  const queryClient = useQueryClient();
  const { facility } = useFacility();
  const [activeTab, setActiveTab] = useState('general');
  const [form, setForm] = useState<FormState | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [touched, setTouched] = useState(false);

  const facilityId = facility?.id ?? null;

  // -------------------------------------------------------------------------
  // Fetch existing billing config for the current facility
  // -------------------------------------------------------------------------

  const configQuery = useQuery({
    queryKey: ['facility-billing-config', facilityId],
    queryFn: async () => {
      const response = await billingApi.getFacilityBillingConfigs({
        page: 1,
        page_size: 1,
        facility: facilityId!,
      });
      return response.results[0] ?? null;
    },
    enabled: facilityId !== null,
  });

  // Seed form when data arrives
  useEffect(() => {
    if (configQuery.data) {
      setForm(configToForm(configQuery.data));
      setTouched(false);
    }
  }, [configQuery.data]);

  const isDirty = useMemo(() => {
    if (!form || !configQuery.data) return false;
    return JSON.stringify(form) !== JSON.stringify(configToForm(configQuery.data));
  }, [form, configQuery.data]);

  const errors = useMemo<FormErrors>(() => (form ? validate(form) : {}), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  // Which tabs have errors?
  const generalTabHasErrors = !!(errors.default_payment_type || errors.default_due_days || errors.tax_rate);
  const mpesaTabHasErrors = !!(errors.mpesa_consumer_key || errors.mpesa_consumer_secret || errors.mpesa_passkey || errors.mpesa_shortcode || errors.mpesa_callback_url);
  const bankTabHasErrors = !!(errors.bank_name || errors.bank_account_number);

  // Payment method gating
  const mpesaConfigured = form ? hasMpesaCredsInForm(form) : false;
  const bankConfigured = form ? hasBankDetailsInForm(form) : false;

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!facilityId) throw new Error('No facility selected');
      return billingApi.createFacilityBillingConfig({ facility: facilityId });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['facility-billing-config', facilityId] });
      setForm(configToForm(created));
      toast.success('Billing configuration created for this facility');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create billing config');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const cfgId = configQuery.data?.id;
      if (!cfgId) throw new Error('No billing config to update');
      return billingApi.updateFacilityBillingConfig(cfgId, formToPayload(values));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['facility-billing-config', facilityId], updated);
      setForm(configToForm(updated));
      setTouched(false);
      toast.success('Payments configuration saved');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save payments configuration');
    },
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const isPending = updateMutation.isPending || createMutation.isPending;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setTouched(true);
  }

  const handleSave = useCallback(() => {
    if (!form) return;
    setTouched(true);
    if (hasErrors) {
      // Navigate to first tab with errors
      if (generalTabHasErrors) setActiveTab('general');
      else if (mpesaTabHasErrors) setActiveTab('mpesa');
      else if (bankTabHasErrors) setActiveTab('bank');
      toast.error('Please fix the highlighted errors before saving.');
      return;
    }
    updateMutation.mutate(form);
  }, [form, hasErrors, generalTabHasErrors, mpesaTabHasErrors, bankTabHasErrors, updateMutation]);

  // -------------------------------------------------------------------------
  // Render: guards
  // -------------------------------------------------------------------------

  if (!facility) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Payments Configuration"
          helpContent="Configure billing defaults, M-Pesa integration, and bank collection accounts for your facility."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No facility is currently selected. Assign a facility to your account or use the facility switcher.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configQuery.isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Payments Configuration"
          helpContent="Configure billing defaults, M-Pesa integration, and bank collection accounts for your facility."
        />
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // No config exists — offer to create one
  if (!configQuery.data) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Payments Configuration"
          helpContent="Configure billing defaults, M-Pesa integration, and bank collection accounts for your facility."
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              No billing configuration found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              <strong>{facility.name}</strong> does not have a billing configuration yet.
              Create one to set up payment defaults, M-Pesa integration, and bank accounts.
            </p>
            <Button onClick={() => createMutation.mutate()} disabled={isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BadgeCent className="mr-2 h-4 w-4" />
              )}
              Initialize Billing Config
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!form) return null;

  // -------------------------------------------------------------------------
  // Render: main form
  // -------------------------------------------------------------------------

  const hasMpesaCreds = configQuery.data.has_mpesa_credentials ?? false;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Payments Configuration"
        helpContent="Configure billing defaults, M-Pesa API credentials, and bank collection accounts for the current facility. M-Pesa credentials are per-facility — each facility can have its own Daraja shortcode."
        actions={
          <Button
            onClick={handleSave}
            disabled={!isDirty || isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        }
      />

      {/* Facility context bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {facility.name}
            <span className="text-muted-foreground"> &bull; MFL {configQuery.data.facility_mfl_code}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Billing config #{configQuery.data.id} &bull; Last updated {new Date(configQuery.data.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={hasMpesaCreds ? 'default' : 'outline'} className="shrink-0 w-fit">
            {hasMpesaCreds ? 'M-Pesa Active' : 'M-Pesa Not Configured'}
          </Badge>
        </div>
      </div>

      {/* Validation banner */}
      {touched && hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Validation errors</AlertTitle>
          <AlertDescription className="text-xs">
            Please fix the highlighted fields before saving.
          </AlertDescription>
        </Alert>
      )}

      {/* Tab layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted h-10 sm:h-11 p-1">
          <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">General</span>
            <span className="hidden sm:inline">Billing Defaults</span>
            {touched && generalTabHasErrors && <span className="ml-1 h-2 w-2 rounded-full bg-destructive" />}
          </TabsTrigger>
          <TabsTrigger value="mpesa" className="gap-1.5 text-xs sm:text-sm">
            <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">M-Pesa</span>
            <span className="hidden sm:inline">M-Pesa Integration</span>
            {touched && mpesaTabHasErrors && <span className="ml-1 h-2 w-2 rounded-full bg-destructive" />}
          </TabsTrigger>
          <TabsTrigger value="bank" className="gap-1.5 text-xs sm:text-sm">
            <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Bank</span>
            <span className="hidden sm:inline">Bank Accounts</span>
            {touched && bankTabHasErrors && <span className="ml-1 h-2 w-2 rounded-full bg-destructive" />}
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* TAB 1: Billing Defaults */}
        {/* ================================================================ */}

        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Billing Defaults</CardTitle>
                <HelpPopover content="Default values applied to new invoices created at this facility. Individual invoices can override these." />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-payment-type">Default payment type<Req /></Label>
                  <TooltipProvider delayDuration={200}>
                    <Select
                      value={form.default_payment_type}
                      onValueChange={(v) => updateField('default_payment_type', v)}
                      disabled={isPending}
                    >
                      <SelectTrigger
                        id="default-payment-type"
                        className={touched && errors.default_payment_type ? 'border-destructive' : ''}
                      >
                        <SelectValue placeholder="Select default" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TYPES.map((pt) => {
                          const gated =
                            (pt.requiresConfig === 'mpesa' && !mpesaConfigured) ||
                            (pt.requiresConfig === 'bank' && !bankConfigured);
                          if (gated) {
                            return (
                              <Tooltip key={pt.value}>
                                <TooltipTrigger asChild>
                                  <div
                                    className="relative flex w-full select-none items-center rounded-sm py-1.5 px-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
                                    aria-disabled="true"
                                  >
                                    {pt.label}
                                    <span className="ml-1.5 text-xs">(not configured)</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {pt.requiresConfig === 'mpesa'
                                    ? 'Configure M-Pesa Daraja API credentials first'
                                    : 'Add bank account details first'}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return (
                            <SelectItem key={pt.value} value={pt.value}>
                              {pt.label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                  <FieldError msg={touched ? errors.default_payment_type : undefined} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-due-days">Invoice due days<Req /></Label>
                  <Input
                    id="default-due-days"
                    type="number"
                    min={1}
                    max={365}
                    value={form.default_due_days}
                    onChange={(e) => updateField('default_due_days', parseInt(e.target.value) || 0)}
                    disabled={isPending}
                    className={touched && errors.default_due_days ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.default_due_days : undefined} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tax-rate">Tax rate (%)<Req /></Label>
                  <Input
                    id="tax-rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(e) => updateField('tax_rate', e.target.value)}
                    disabled={isPending}
                    className={touched && errors.tax_rate ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.tax_rate : undefined} />
                  <p className="text-xs text-muted-foreground">
                    Medical services in Kenya are typically VAT-exempt (0%).
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-primary/10 px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Auto-finalize on checkout</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically finalize draft invoices when a patient checks out.
                  </p>
                </div>
                <Switch
                  checked={form.auto_finalize_on_checkout}
                  onCheckedChange={(v) => updateField('auto_finalize_on_checkout', v)}
                  disabled={isPending}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button
                onClick={handleSave}
                disabled={!isDirty || isPending}
                size="sm"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 2: M-Pesa Integration */}
        {/* ================================================================ */}

        <TabsContent value="mpesa" className="space-y-4 mt-4">
          {/* Collection account details */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">M-Pesa Collection Account</CardTitle>
                <HelpPopover content="The Paybill or Till number displayed to patients for manual payments and printed on receipts." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mpesa-paybill">Paybill / Till number</Label>
                  <Input
                    id="mpesa-paybill"
                    value={form.mpesa_paybill}
                    onChange={(e) => updateField('mpesa_paybill', e.target.value)}
                    placeholder="e.g. 174379"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mpesa-account-ref">Account reference</Label>
                  <Input
                    id="mpesa-account-ref"
                    value={form.mpesa_account_ref}
                    onChange={(e) => updateField('mpesa_account_ref', e.target.value)}
                    placeholder="e.g. FACILITY-001"
                    disabled={isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daraja API credentials */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Daraja API Credentials</CardTitle>
                <HelpPopover content="Per-facility Safaricom Daraja API credentials for automated STK Push payments. Fill all four required fields or leave all empty to use system-wide defaults." />
                {hasMpesaCreds && (
                  <Badge variant="default" className="ml-auto gap-1">
                    <ShieldCheck className="h-3 w-3" /> Configured
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTitle className="text-sm">Multi-tenant M-Pesa</AlertTitle>
                <AlertDescription className="text-xs">
                  Each facility can have its own Daraja API credentials and shortcode.
                  Either fill <strong>all four</strong> required credential fields, or leave them all empty
                  to fall back to system-wide environment variables.
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? (
                    <><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide secrets</>
                  ) : (
                    <><Eye className="mr-1.5 h-3.5 w-3.5" /> Show secrets</>
                  )}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mpesa-environment">Environment</Label>
                  <Select
                    value={form.mpesa_environment}
                    onValueChange={(v) => updateField('mpesa_environment', v)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="mpesa-environment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MPESA_ENVIRONMENTS.map((env) => (
                        <SelectItem key={env.value} value={env.value}>
                          {env.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mpesa-shortcode">
                    Business shortcode{form.mpesa_environment === 'production' && <Req />}
                  </Label>
                  <Input
                    id="mpesa-shortcode"
                    value={form.mpesa_shortcode}
                    onChange={(e) => updateField('mpesa_shortcode', e.target.value)}
                    placeholder={form.mpesa_environment === 'sandbox' ? 'Optional in sandbox (defaults to 174379)' : 'e.g. 174379'}
                    disabled={isPending}
                    className={touched && errors.mpesa_shortcode ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.mpesa_shortcode : undefined} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mpesa-consumer-key">Consumer key<Req /></Label>
                  <Input
                    id="mpesa-consumer-key"
                    type={showSecrets ? 'text' : 'password'}
                    value={form.mpesa_consumer_key}
                    onChange={(e) => updateField('mpesa_consumer_key', e.target.value)}
                    placeholder="Daraja consumer key"
                    autoComplete="off"
                    disabled={isPending}
                    className={touched && errors.mpesa_consumer_key ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.mpesa_consumer_key : undefined} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mpesa-consumer-secret">Consumer secret<Req /></Label>
                  <Input
                    id="mpesa-consumer-secret"
                    type={showSecrets ? 'text' : 'password'}
                    value={form.mpesa_consumer_secret}
                    onChange={(e) => updateField('mpesa_consumer_secret', e.target.value)}
                    placeholder="Daraja consumer secret"
                    autoComplete="off"
                    disabled={isPending}
                    className={touched && errors.mpesa_consumer_secret ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.mpesa_consumer_secret : undefined} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mpesa-passkey">
                    Lipa Na M-Pesa passkey{form.mpesa_environment === 'production' && <Req />}
                  </Label>
                  <Input
                    id="mpesa-passkey"
                    type={showSecrets ? 'text' : 'password'}
                    value={form.mpesa_passkey}
                    onChange={(e) => updateField('mpesa_passkey', e.target.value)}
                    placeholder={form.mpesa_environment === 'sandbox' ? 'Optional in sandbox (uses shared test passkey)' : 'STK Push passkey'}
                    autoComplete="off"
                    disabled={isPending}
                    className={touched && errors.mpesa_passkey ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.mpesa_passkey : undefined} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mpesa-callback-url">
                    Callback URL{form.mpesa_environment === 'production' && hasMpesaCredsInForm(form) && <Req />}
                  </Label>
                  <Input
                    id="mpesa-callback-url"
                    type="url"
                    value={form.mpesa_callback_url}
                    onChange={(e) => updateField('mpesa_callback_url', e.target.value)}
                    placeholder="https://your-domain.com/api/billing/mpesa/callback/"
                    disabled={isPending}
                    className={touched && errors.mpesa_callback_url ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.mpesa_callback_url : undefined} />
                  <p className="text-xs text-muted-foreground">
                    The publicly accessible URL where Safaricom sends payment results.
                    {form.mpesa_environment === 'production' ? ' Required for production — must be HTTPS.' : ' Optional for sandbox.'}
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button
                onClick={handleSave}
                disabled={!isDirty || isPending}
                size="sm"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* TAB 3: Bank Accounts */}
        {/* ================================================================ */}

        <TabsContent value="bank" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Bank Collection Account</CardTitle>
                <HelpPopover content="Bank account details used for bank transfer payments and printed on invoices. Fill both bank name and account number, or leave both empty." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank-name">
                    Bank name{form.bank_account_number ? <Req /> : ''}
                  </Label>
                  <Input
                    id="bank-name"
                    value={form.bank_name}
                    onChange={(e) => updateField('bank_name', e.target.value)}
                    placeholder="e.g. Kenya Commercial Bank"
                    disabled={isPending}
                    className={touched && errors.bank_name ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.bank_name : undefined} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank-branch">Branch</Label>
                  <Input
                    id="bank-branch"
                    value={form.bank_branch}
                    onChange={(e) => updateField('bank_branch', e.target.value)}
                    placeholder="e.g. Moi Avenue Branch"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bank-account-number">
                    Account number{form.bank_name ? <Req /> : ''}
                  </Label>
                  <Input
                    id="bank-account-number"
                    value={form.bank_account_number}
                    onChange={(e) => updateField('bank_account_number', e.target.value)}
                    placeholder="e.g. 1234567890"
                    disabled={isPending}
                    className={touched && errors.bank_account_number ? 'border-destructive' : ''}
                  />
                  <FieldError msg={touched ? errors.bank_account_number : undefined} />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t pt-4">
              <Button
                onClick={handleSave}
                disabled={!isDirty || isPending}
                size="sm"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
