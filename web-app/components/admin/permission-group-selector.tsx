import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Permission } from '@/lib/types/rbac';

interface PermissionGroupSelectorProps {
  permissions: Permission[];
  selectedPermissions: string[];
  onToggle: (permissionCode: string) => void;
  onToggleGroup?: (permissionCodes: string[], selected: boolean) => void;
  emptyMessage?: string;
}

function groupPermissions(permissions: Permission[]) {
  return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const key = permission.app_label || 'other';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(permission);
    return groups;
  }, {});
}

export function PermissionGroupSelector({
  permissions,
  selectedPermissions,
  onToggle,
  onToggleGroup,
  emptyMessage = 'No permissions available.',
}: PermissionGroupSelectorProps) {
  const groupedPermissions = groupPermissions(permissions);
  const defaultOpenGroups = Object.entries(groupedPermissions)
    .filter(([, items]) =>
      items.some((item) => selectedPermissions.includes(`${item.app_label}.${item.codename}`))
    )
    .map(([group]) => group);

  if (permissions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Accordion type="multiple" defaultValue={defaultOpenGroups} className="w-full">
      {Object.entries(groupedPermissions).map(([group, items]) => {
        const groupCodes = items.map((item) => `${item.app_label}.${item.codename}`);
        const selectedCount = groupCodes.filter((code) =>
          selectedPermissions.includes(code)
        ).length;
        const allSelected = selectedCount === items.length;
        const someSelected = selectedCount > 0 && !allSelected;

        const handleSelectAll = () => {
          if (onToggleGroup) {
            onToggleGroup(groupCodes, !allSelected);
          } else {
            // Fallback: toggle each individually
            for (const code of groupCodes) {
              const isSelected = selectedPermissions.includes(code);
              if (allSelected && isSelected) {
                onToggle(code);
              } else if (!allSelected && !isSelected) {
                onToggle(code);
              }
            }
          }
        };

        return (
          <AccordionItem key={group} value={group}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-1 items-center gap-3">
                <span className="font-medium capitalize">{group}</span>
                <Badge variant={selectedCount > 0 ? 'default' : 'outline'}>
                  {selectedCount}/{items.length}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2">
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-3 transition-colors hover:bg-muted/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={handleSelectAll}
                    aria-label={`Select all ${group} permissions`}
                  />
                  <span className="text-sm font-medium text-muted-foreground">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((permission) => {
                    const permissionCode = `${permission.app_label}.${permission.codename}`;
                    const isSelected = selectedPermissions.includes(permissionCode);

                    return (
                      <label
                        key={permissionCode}
                        htmlFor={permissionCode}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                          isSelected ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          id={permissionCode}
                          checked={isSelected}
                          onCheckedChange={() => onToggle(permissionCode)}
                          aria-label={permission.name}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium text-foreground">{permission.name}</span>
                          <span className="block text-xs text-muted-foreground">{permission.codename}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
