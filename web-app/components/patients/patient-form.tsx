'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { LocationCombobox } from '@/components/ui/location-combobox';
import { cn } from '@/lib/utils';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import { GENDER_OPTIONS, REFERRAL_SOURCE_OPTIONS, RELATIONSHIP_OPTIONS } from '@/lib/utils/constants';
import type { PatientCreateData } from '@/lib/types/patient';

// Validation schema
const patientFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  date_of_birth: z.date({
    required_error: 'Date of birth is required',
  }).refine((date) => date <= new Date(), {
    message: 'Date of birth cannot be in the future',
  }),
  gender: z.enum(['M', 'F', 'O'], {
    required_error: 'Gender is required',
  }),
  national_id: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  county: z.number({
    required_error: 'County is required',
  }),
  sub_county: z.number({
    required_error: 'Sub-county is required',
  }),
  ward: z.number().optional(),
  village: z.string().optional(),
  referral_source: z.enum(['self', 'clinic', 'other_facility']).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relationship: z.string().optional(),
  consent_given: z.boolean().default(false),
  consent_data_processing: z.boolean().default(false),
  consent_data_sharing: z.boolean().default(false),
});

type PatientFormValues = z.infer<typeof patientFormSchema>;

interface PatientFormProps {
  onSubmit: (data: PatientCreateData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  defaultValues?: Partial<PatientFormValues>;
  isEditing?: boolean;
}

export function PatientForm({ onSubmit, onCancel, isLoading, defaultValues, isEditing = false }: PatientFormProps) {
  // Prevent double submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [dobPopoverOpen, setDobPopoverOpen] = useState(false);
  const [showCustomRelationship, setShowCustomRelationship] = useState(false);
  const [customRelationship, setCustomRelationship] = useState('');

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      gender: undefined,
      national_id: '',
      phone_number: '',
      email: '',
      village: '',
      referral_source: 'self',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      emergency_contact_relationship: '',
      consent_given: false,
      consent_data_processing: false,
      consent_data_sharing: false,
      ...defaultValues,
    },
  });

  const selectedCounty = form.watch('county');
  const selectedSubCounty = form.watch('sub_county');

  const { data: counties, isLoading: isLoadingCounties } = useCounties();
  const { data: subCounties, isLoading: isLoadingSubCounties } = useSubCounties(selectedCounty);
  const { data: wards, isLoading: isLoadingWards } = useWards(selectedSubCounty);

  const handleSubmit = async (values: PatientFormValues) => {
    // Prevent double submission
    if (submitLockRef.current || isSubmitting) {
      return;
    }
    
    submitLockRef.current = true;
    setIsSubmitting(true);
    
    try {
      const data: PatientCreateData = {
        ...values,
        date_of_birth: format(values.date_of_birth, 'yyyy-MM-dd'),
        // Combine consent fields
        consent_given: values.consent_given && values.consent_data_processing,
      };
      await onSubmit(data);
    } finally {
      // Reset lock after a delay to ensure navigation completes
      setTimeout(() => {
        submitLockRef.current = false;
        setIsSubmitting(false);
      }, 1000);
    }
  };

  const isFormLoading = isLoading || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Basic Information</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter first name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter last name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date of Birth *</FormLabel>
                  <Popover open={dobPopoverOpen} onOpenChange={setDobPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          field.onChange(date);
                          setDobPopoverOpen(false);
                        }}
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        defaultMonth={field.value || new Date(2000, 0)}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Gender *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-wrap gap-4"
                    >
                      {GENDER_OPTIONS.map((option) => (
                        <div key={option.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={option.value} id={`gender-${option.value}`} />
                          <Label htmlFor={`gender-${option.value}`} className="cursor-pointer font-normal">
                            {option.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Contact Information</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+254..." {...field} />
                  </FormControl>
                  <FormDescription>Kenya phone format: +254XXXXXXXXX</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="national_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter national ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (Optional)</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="email@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Location Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Location</h3>
          
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="county"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>County *</FormLabel>
                  <FormControl>
                    <LocationCombobox
                      options={counties?.map(c => ({ value: c.id.toString(), label: c.name })) || []}
                      value={field.value?.toString()}
                      onSelect={(value) => {
                        field.onChange(Number(value));
                        // Reset sub-county and ward when county changes
                        form.setValue('sub_county', undefined as unknown as number);
                        form.setValue('ward', undefined);
                      }}
                      placeholder="Select county"
                      searchPlaceholder="Search counties..."
                      emptyMessage="No county found."
                      isLoading={isLoadingCounties}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sub_county"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sub-County *</FormLabel>
                  <FormControl>
                    <LocationCombobox
                      options={subCounties?.map(sc => ({ value: sc.id.toString(), label: sc.name })) || []}
                      value={field.value?.toString()}
                      onSelect={(value) => {
                        field.onChange(Number(value));
                        // Reset ward when sub-county changes
                        form.setValue('ward', undefined);
                      }}
                      placeholder={!selectedCounty ? 'Select county first' : 'Select sub-county'}
                      searchPlaceholder="Search sub-counties..."
                      emptyMessage="No sub-county found."
                      disabled={!selectedCounty}
                      isLoading={isLoadingSubCounties}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ward"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ward (Optional)</FormLabel>
                  <FormControl>
                    <LocationCombobox
                      options={wards?.map(w => ({ value: w.id.toString(), label: w.name })) || []}
                      value={field.value?.toString()}
                      onSelect={(value) => field.onChange(Number(value))}
                      placeholder={!selectedSubCounty ? 'Select sub-county first' : 'Select ward'}
                      searchPlaceholder="Search wards..."
                      emptyMessage="No ward found."
                      disabled={!selectedSubCounty}
                      isLoading={isLoadingWards}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="village"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Village/Estate (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Enter village or estate" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Emergency Contact */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Emergency Contact</h3>
          
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="emergency_contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emergency_contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="+254..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emergency_contact_relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship</FormLabel>
                  {!showCustomRelationship ? (
                    <Select 
                      onValueChange={(value) => {
                        if (value === 'other') {
                          setShowCustomRelationship(true);
                          field.onChange('');
                        } else {
                          field.onChange(value);
                        }
                      }} 
                      value={field.value || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select relationship" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RELATIONSHIP_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="Specify relationship" 
                          value={customRelationship}
                          onChange={(e) => {
                            setCustomRelationship(e.target.value);
                            field.onChange(e.target.value);
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCustomRelationship(false);
                          setCustomRelationship('');
                          field.onChange('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Referral Source */}
        <FormField
          control={form.control}
          name="referral_source"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Referral Source</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-wrap gap-4"
                >
                  {REFERRAL_SOURCE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={option.value} id={`referral-${option.value}`} />
                      <Label htmlFor={`referral-${option.value}`} className="cursor-pointer font-normal">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Consent Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Data Protection Consent</h3>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Kenya Data Protection Act 2019</AlertTitle>
            <AlertDescription>
              Patient consent is required for processing and storing personal health information.
              Data will be encrypted and stored securely in compliance with the law.
            </AlertDescription>
          </Alert>

          <div className="space-y-4 rounded-lg border p-4">
            <FormField
              control={form.control}
              name="consent_given"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I consent to the collection and storage of my health information *
                    </FormLabel>
                    <FormDescription>
                      This includes personal details, medical history, and treatment records.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consent_data_processing"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I consent to the processing of my data for healthcare purposes *
                    </FormLabel>
                    <FormDescription>
                      This allows healthcare providers to access records for diagnosis and treatment.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consent_data_sharing"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I consent to data sharing for statutory reporting (Optional)
                    </FormLabel>
                    <FormDescription>
                      Anonymous data may be shared with KHIS/Ministry of Health for public health monitoring.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Button type="submit" disabled={isFormLoading}>
            {isFormLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update Patient' : 'Register Patient'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isFormLoading}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
