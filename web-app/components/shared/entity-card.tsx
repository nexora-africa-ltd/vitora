'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type Gender = 'M' | 'F' | 'O' | 'male' | 'female' | 'other' | null | undefined;

interface MetadataItem {
  icon?: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
}

interface ActionItem {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'destructive';
}

interface EntityCardProps {
  /** Primary display name */
  title: string;
  /** Secondary text (e.g., username, ID) */
  subtitle?: string;
  /** Avatar image URL */
  avatarUrl?: string;
  /** Initials for avatar fallback */
  initials?: string;
  /** Gender for avatar ring color */
  gender?: Gender;
  /** Status badge */
  status?: {
    label: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  /** Additional badges */
  badges?: Array<{
    label: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  }>;
  /** Metadata fields to display */
  metadata?: MetadataItem[];
  /** Link for the entire card */
  href?: string;
  /** Click handler (alternative to href) */
  onClick?: () => void;
  /** Dropdown menu actions */
  actions?: ActionItem[];
  /** Additional class name */
  className?: string;
}

/**
 * Get avatar ring color based on gender
 * Uses CSS variables from globals.css
 */
function getGenderRingClass(gender: Gender): string {
  const normalizedGender = gender?.toString().toUpperCase();
  switch (normalizedGender) {
    case 'M':
    case 'MALE':
      return 'ring-[hsl(var(--gender-male))]';
    case 'F':
    case 'FEMALE':
      return 'ring-[hsl(var(--gender-female))]';
    case 'O':
    case 'OTHER':
      return 'ring-[hsl(var(--gender-other))]';
    default:
      return 'ring-border';
  }
}

/**
 * Get avatar background color based on gender
 */
function getGenderBgClass(gender: Gender): string {
  const normalizedGender = gender?.toString().toUpperCase();
  switch (normalizedGender) {
    case 'M':
    case 'MALE':
      return 'bg-[hsl(var(--gender-male)/0.15)] text-[hsl(var(--gender-male))]';
    case 'F':
    case 'FEMALE':
      return 'bg-[hsl(var(--gender-female)/0.15)] text-[hsl(var(--gender-female))]';
    case 'O':
    case 'OTHER':
      return 'bg-[hsl(var(--gender-other)/0.15)] text-[hsl(var(--gender-other))]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/**
 * Reusable entity card component for grid views
 * Used for staff, patients, and other entity lists
 */
export function EntityCard({
  title,
  subtitle,
  avatarUrl,
  initials,
  gender,
  status,
  badges = [],
  metadata = [],
  href,
  onClick,
  actions = [],
  className,
}: EntityCardProps) {
  const isClickable = href || onClick;

  const cardContent = (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all hover:shadow-md',
        isClickable && 'cursor-pointer transition-colors hover:border-teal-400/50 hover:scale-105',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Actions dropdown */}
        {actions.length > 0 && (
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.map((action, index) => (
                  <DropdownMenuItem
                    key={index}
                    className={action.variant === 'destructive' ? 'text-destructive' : ''}
                    onClick={(e) => {
                      e.preventDefault();
                      action.onClick?.();
                    }}
                    asChild={!!action.href}
                  >
                    {action.href ? (
                      <Link href={action.href}>{action.label}</Link>
                    ) : (
                      action.label
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Header with Avatar */}
        <div className="flex items-start gap-3">
          <Avatar
            className={cn(
              'h-12 w-12 ring-2 ring-offset-2 ring-offset-background',
              getGenderRingClass(gender)
            )}
          >
            {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
            <AvatarFallback className={cn('text-sm font-medium', getGenderBgClass(gender))}>
              {initials || title.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm leading-tight truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
            )}

            {/* Badges row */}
            {(status || badges.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {status && (
                  <Badge variant={status.variant || 'default'} className="text-xs">
                    {status.label}
                  </Badge>
                )}
                {badges.map((badge, index) => (
                  <Badge key={index} variant={badge.variant || 'secondary'} className="text-xs">
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Metadata fields */}
        {metadata.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            {metadata.map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                {item.icon && (
                  <span className="text-muted-foreground shrink-0">{item.icon}</span>
                )}
                <span className="text-muted-foreground shrink-0">{item.label}:</span>
                <span className="truncate">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
}

/**
 * Grid container for entity cards
 * Responsive: 1 col on mobile, 2 on md, 3 on lg, 4 on xl
 */
export function EntityGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  );
}
