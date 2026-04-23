'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowRight,
  Building2,
  GitBranch,
  Network,
  Search,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import type { Department, StaffProfile } from '@/lib/types/rbac';
import type { FacilityListItem } from '@/lib/types/facility';
import type { OrganizationListItem } from '@/lib/types/organization';

const DEPARTMENT_NODE_WIDTH = 260;
const NODE_HEIGHT = 138;
const STAFF_NODE_WIDTH = 220;
const STAFF_NODE_HEIGHT = 112;
const FACILITY_NODE_WIDTH = 260;
const FACILITY_NODE_HEIGHT = 128;
const HORIZONTAL_GAP = 84;
const VERTICAL_GAP = 228;
const STAFF_VERTICAL_GAP = 160;

type DepartmentNodeData = {
  kind: 'department';
  departmentId: number;
  name: string;
  code: string;
  departmentTypeDisplay: string;
  headName: string | null;
  staffCount: number;
  directReports: number;
  isActive: boolean;
};

type StaffNodeData = {
  kind: 'staff';
  staffId: number;
  departmentId: number;
  fullName: string;
  roleName: string | null;
  title: string | null;
  supervisorId: number | null;
  isHead: boolean;
  employmentStatus: string | null;
};

type OrganizationNodeData = {
  kind: 'organization';
  orgId: number;
  name: string;
  slug: string;
  subscriptionTier: string;
  facilityCount: number;
  staffCount: number;
  countyName: string | null;
  isActive: boolean;
};

type FacilityNodeData = {
  kind: 'facility';
  facilityId: number;
  orgId: number;
  name: string;
  mflCode: string;
  level: string;
  ownership: string;
  countyName: string;
  isHeadquarters: boolean;
  isActive: boolean;
};

type OrgChartNodeData = DepartmentNodeData | StaffNodeData | OrganizationNodeData | FacilityNodeData;

type DepartmentDetail = {
  department: Department;
  headName: string | null;
  childCount: number;
  parentName: string | null;
  supervisorCoverage: number;
};

type ChartBuildResult = {
  nodes: Node<OrgChartNodeData>[];
  edges: Edge[];
  detailsById: Map<number, DepartmentDetail>;
  staffById: Map<number, StaffProfile>;
  firstDepartmentId: number | null;
};

type SearchResult =
  | {
      kind: 'department';
      id: number;
      label: string;
      description: string;
      nodeId: string;
    }
  | {
      kind: 'staff';
      id: number;
      departmentId: number;
      label: string;
      description: string;
      nodeId: string;
    }
  | {
      kind: 'organization';
      id: number;
      label: string;
      description: string;
      nodeId: string;
    };

function DepartmentNode({ data, selected }: NodeProps<Node<DepartmentNodeData>>) {
  return (
    <div
      className={cn(
        'w-[260px] rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm transition-all',
        selected
          ? 'border-cyan-500 ring-2 ring-cyan-500/25'
          : 'border-border/70 hover:border-cyan-500/40',
        !data.isActive && 'opacity-75'
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-cyan-500" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{data.name}</p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{data.code}</p>
          </div>
          <Badge variant={data.isActive ? 'default' : 'secondary'}>
            {data.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.departmentTypeDisplay}</Badge>
          <Badge variant="secondary">{data.staffCount} staff</Badge>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{data.headName || 'No head assigned'}</span>
          </div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span>{data.directReports} sub-departments</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-cyan-500" />
    </div>
  );
}

function StaffNode({ data, selected }: NodeProps<Node<StaffNodeData>>) {
  const isActive = data.employmentStatus === 'ACTIVE' || data.employmentStatus === null;

  return (
    <div
      className={cn(
        'w-[220px] rounded-2xl border bg-background/95 p-3 shadow-md transition-all',
        selected ? 'border-cyan-500 ring-2 ring-cyan-500/25' : 'border-border/70',
        !isActive && 'opacity-70'
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-cyan-500" />
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{data.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {data.roleName || 'Role not assigned'}
            </p>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {data.employmentStatus || 'ACTIVE'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.title ? <Badge variant="outline">{data.title}</Badge> : null}
          {data.isHead ? <Badge variant="secondary">Department head</Badge> : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-cyan-500" />
    </div>
  );
}

const ORG_NODE_WIDTH = 280;
const ORG_NODE_HEIGHT = 148;

function OrganizationNode({ data, selected }: NodeProps<Node<OrganizationNodeData>>) {
  const tierColors: Record<string, string> = {
    FREE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    BASIC: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    PROFESSIONAL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    ENTERPRISE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };

  return (
    <div
      className={cn(
        'w-[280px] rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm transition-all',
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500/25'
          : 'border-border/70 hover:border-indigo-500/40',
        !data.isActive && 'opacity-75'
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-indigo-500" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{data.name}</p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{data.slug}</p>
          </div>
          <Badge className={tierColors[data.subscriptionTier] ?? ''}>
            {data.subscriptionTier}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{data.facilityCount} facilities</Badge>
          <Badge variant="secondary">{data.staffCount} staff</Badge>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {data.countyName && (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{data.countyName}</span>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-indigo-500" />
    </div>
  );
}

function FacilityNode({ data, selected }: NodeProps<Node<FacilityNodeData>>) {
  return (
    <div
      className={cn(
        'w-[260px] rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm transition-all',
        selected
          ? 'border-emerald-500 ring-2 ring-emerald-500/25'
          : 'border-border/70 hover:border-emerald-500/40',
        !data.isActive && 'opacity-75'
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-emerald-500" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{data.name}</p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">MFL {data.mflCode}</p>
          </div>
          {data.isHeadquarters ? (
            <Badge variant="default">HQ</Badge>
          ) : (
            <Badge variant={data.isActive ? 'secondary' : 'outline'}>
              {data.isActive ? 'Active' : 'Inactive'}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Level {data.level}</Badge>
          <Badge variant="secondary">{data.ownership}</Badge>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{data.countyName}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !bg-emerald-500" />
    </div>
  );
}

const nodeTypes = {
  department: DepartmentNode,
  staff: StaffNode,
  organization: OrganizationNode,
  facility: FacilityNode,
};

function buildOrgChart(
  departments: Department[],
  staff: StaffProfile[],
  organizations: OrganizationListItem[],
  facilities: FacilityListItem[],
  focusedDepartmentId: number | null,
  showStaffLines: boolean
): ChartBuildResult {
  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const staffById = new Map(staff.map((staffMember) => [staffMember.id, staffMember]));
  const childrenByParent = new Map<number | null, number[]>();
  const positions = new Map<number, { x: number; y: number }>();
  const detailsById = new Map<number, DepartmentDetail>();
  const supervisorCounts = new Map<number, { total: number; assigned: number }>();

  for (const staffMember of staff) {
    if (!staffMember.primary_department) {
      continue;
    }

    const current = supervisorCounts.get(staffMember.primary_department) ?? {
      total: 0,
      assigned: 0,
    };
    current.total += 1;
    if (staffMember.supervisor) {
      current.assigned += 1;
    }
    supervisorCounts.set(staffMember.primary_department, current);
  }

  for (const department of departments) {
    const normalizedParentId = department.parent && departmentsById.has(department.parent)
      ? department.parent
      : null;
    const siblings = childrenByParent.get(normalizedParentId) ?? [];
    siblings.push(department.id);
    childrenByParent.set(normalizedParentId, siblings);
  }

  for (const childList of childrenByParent.values()) {
    childList.sort((leftId, rightId) => {
      const left = departmentsById.get(leftId);
      const right = departmentsById.get(rightId);
      if (!left || !right) {
        return 0;
      }
      return left.name.localeCompare(right.name);
    });
  }

  let leafIndex = 0;
  const visited = new Set<number>();

  const placeSubtree = (departmentId: number, depth: number): number => {
    if (visited.has(departmentId)) {
      const fallbackPosition = positions.get(departmentId);
      return fallbackPosition?.x ?? 0;
    }

    visited.add(departmentId);
    const childIds = childrenByParent.get(departmentId) ?? [];

    if (childIds.length === 0) {
      const x = leafIndex * (DEPARTMENT_NODE_WIDTH + HORIZONTAL_GAP);
      positions.set(departmentId, { x, y: depth * VERTICAL_GAP });
      leafIndex += 1;
      return x;
    }

    const childPositions = childIds.map((childId) => placeSubtree(childId, depth + 1));
    const minChildX = Math.min(...childPositions);
    const maxChildX = Math.max(...childPositions);
    const x = minChildX + (maxChildX - minChildX) / 2;
    positions.set(departmentId, { x, y: depth * VERTICAL_GAP });
    return x;
  };

  const rootIds = childrenByParent.get(null) ?? [];
  for (const rootId of rootIds) {
    placeSubtree(rootId, 0);
  }

  for (const department of departments) {
    if (positions.has(department.id)) {
      continue;
    }
    const x = leafIndex * (DEPARTMENT_NODE_WIDTH + HORIZONTAL_GAP);
    positions.set(department.id, { x, y: 0 });
    leafIndex += 1;
  }

  const minX = Math.min(...Array.from(positions.values(), (position) => position.x));

  const nodes: Node<OrgChartNodeData>[] = departments.map((department) => {
    const position = positions.get(department.id) ?? { x: 0, y: 0 };
    const childIds = childrenByParent.get(department.id) ?? [];
    const supervisorStats = supervisorCounts.get(department.id) ?? { total: 0, assigned: 0 };
    const supervisorCoverage = supervisorStats.total > 0
      ? Math.round((supervisorStats.assigned / supervisorStats.total) * 100)
      : 0;

    detailsById.set(department.id, {
      department,
      headName: department.head_name,
      childCount: childIds.length,
      parentName: department.parent_name,
      supervisorCoverage,
    });

    return {
      id: `department-${department.id}`,
      type: 'department',
      position: {
        x: position.x - minX + 40,
        y: position.y + 40,
      },
      draggable: false,
      selectable: true,
      selected: department.id === focusedDepartmentId,
      data: {
        kind: 'department',
        departmentId: department.id,
        name: department.name,
        code: department.code,
        departmentTypeDisplay: department.department_type_display,
        headName: department.head_name,
        staffCount: department.staff_count,
        directReports: childIds.length,
        isActive: department.is_active,
      },
    } satisfies Node<OrgChartNodeData>;
  });

  const edges: Edge[] = departments
    .filter((department) => department.parent && departmentsById.has(department.parent))
    .map((department) => ({
      id: `edge-${department.parent}-${department.id}`,
      source: `department-${department.parent}`,
      target: `department-${department.id}`,
      type: 'smoothstep',
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
      },
      style: {
        strokeWidth: 1.5,
        stroke: '#0891b2',
      },
    }));

  if (showStaffLines && focusedDepartmentId !== null && departmentsById.has(focusedDepartmentId)) {
    const departmentPosition = positions.get(focusedDepartmentId) ?? { x: 0, y: 0 };
    const departmentNodeX = departmentPosition.x - minX + 40;
    const departmentNodeY = departmentPosition.y + 40;
    const department = departmentsById.get(focusedDepartmentId)!;

    const departmentStaff = staff
      .filter((staffMember) => staffMember.primary_department === focusedDepartmentId)
      .sort((left, right) => left.full_name.localeCompare(right.full_name));
    const departmentStaffIds = new Set(departmentStaff.map((staffMember) => staffMember.id));
    const staffChildren = new Map<number | null, number[]>();
    const staffPositions = new Map<number, { x: number; y: number }>();
    let staffLeafIndex = 0;

    for (const staffMember of departmentStaff) {
      const supervisorId =
        staffMember.supervisor && departmentStaffIds.has(staffMember.supervisor)
          ? staffMember.supervisor
          : null;
      const siblingIds = staffChildren.get(supervisorId) ?? [];
      siblingIds.push(staffMember.id);
      staffChildren.set(supervisorId, siblingIds);
    }

    for (const childIds of staffChildren.values()) {
      childIds.sort((leftId, rightId) => {
        const left = staffById.get(leftId);
        const right = staffById.get(rightId);
        if (!left || !right) {
          return 0;
        }
        return left.full_name.localeCompare(right.full_name);
      });
    }

    const placeStaffSubtree = (staffId: number, depth: number): number => {
      const childIds = staffChildren.get(staffId) ?? [];
      if (childIds.length === 0) {
        const x = staffLeafIndex * (STAFF_NODE_WIDTH + HORIZONTAL_GAP);
        staffPositions.set(staffId, { x, y: depth * STAFF_VERTICAL_GAP });
        staffLeafIndex += 1;
        return x;
      }

      const childX = childIds.map((childId) => placeStaffSubtree(childId, depth + 1));
      const minChildX = Math.min(...childX);
      const maxChildX = Math.max(...childX);
      const x = minChildX + (maxChildX - minChildX) / 2;
      staffPositions.set(staffId, { x, y: depth * STAFF_VERTICAL_GAP });
      return x;
    };

    const rootStaffIds = staffChildren.get(null) ?? [];
    for (const rootStaffId of rootStaffIds) {
      placeStaffSubtree(rootStaffId, 0);
    }

    for (const staffMember of departmentStaff) {
      if (staffPositions.has(staffMember.id)) {
        continue;
      }
      const x = staffLeafIndex * (STAFF_NODE_WIDTH + HORIZONTAL_GAP);
      staffPositions.set(staffMember.id, { x, y: 0 });
      staffLeafIndex += 1;
    }

    const staffXValues = Array.from(staffPositions.values(), (position) => position.x);
    const staffMinX = staffXValues.length > 0 ? Math.min(...staffXValues) : 0;
    const staffMaxX = staffXValues.length > 0 ? Math.max(...staffXValues) : 0;
    const staffTreeWidth = staffMaxX - staffMinX;
    const baseShiftX = departmentNodeX + DEPARTMENT_NODE_WIDTH / 2 - staffTreeWidth / 2 - STAFF_NODE_WIDTH / 2;

    for (const staffMember of departmentStaff) {
      const staffPosition = staffPositions.get(staffMember.id) ?? { x: 0, y: 0 };
      const normalizedSupervisorId =
        staffMember.supervisor && departmentStaffIds.has(staffMember.supervisor)
          ? staffMember.supervisor
          : null;
      const isHead = department.head === staffMember.id;
      nodes.push({
        id: `staff-${staffMember.id}`,
        type: 'staff',
        position: {
          x: baseShiftX + (staffPosition.x - staffMinX),
          y: departmentNodeY + NODE_HEIGHT + 120 + staffPosition.y,
        },
        draggable: false,
        selectable: true,
        data: {
          kind: 'staff',
          staffId: staffMember.id,
          departmentId: focusedDepartmentId,
          fullName: staffMember.full_name,
          roleName: staffMember.primary_role_name ?? null,
          title: staffMember.title ?? null,
          supervisorId: normalizedSupervisorId,
          isHead,
          employmentStatus: staffMember.employment_status ?? null,
        },
      } satisfies Node<OrgChartNodeData>);

      edges.push(
        normalizedSupervisorId
          ? {
              id: `staff-edge-${normalizedSupervisorId}-${staffMember.id}`,
              source: `staff-${normalizedSupervisorId}`,
              target: `staff-${staffMember.id}`,
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 1.5, stroke: '#0f766e' },
            }
          : {
              id: `department-staff-edge-${focusedDepartmentId}-${staffMember.id}`,
              source: `department-${focusedDepartmentId}`,
              target: `staff-${staffMember.id}`,
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 1.5, stroke: '#0f766e', strokeDasharray: '6 4' },
            }
      );
    }
  }

  // Add organization + facility nodes at the top, shift everything else down
  const hasOrgs = organizations.length > 0;
  const hasFacilities = facilities.length > 0;
  const facilityYOffset = hasFacilities ? FACILITY_NODE_HEIGHT + VERTICAL_GAP : 0;
  const orgYOffset = hasOrgs ? ORG_NODE_HEIGHT + VERTICAL_GAP : 0;
  const totalTopOffset = orgYOffset + facilityYOffset;

  if (hasOrgs || hasFacilities) {
    // Shift all existing department/staff nodes down
    for (const node of nodes) {
      node.position.y += totalTopOffset;
    }

    const existingXValues = nodes.map((n) => n.position.x);
    const existingMinX = existingXValues.length > 0 ? Math.min(...existingXValues) : 40;
    const existingMaxX = existingXValues.length > 0 ? Math.max(...existingXValues) : 40;
    const existingCenterX = (existingMinX + existingMaxX) / 2;

    // Place org nodes in a row at the top
    if (hasOrgs) {
      const orgTotalWidth = organizations.length * (ORG_NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
      const orgStartX = existingCenterX - orgTotalWidth / 2;

      organizations.forEach((org, index) => {
        const orgNodeId = `org-${org.id}`;
        nodes.push({
          id: orgNodeId,
          type: 'organization',
          position: {
            x: orgStartX + index * (ORG_NODE_WIDTH + HORIZONTAL_GAP),
            y: 40,
          },
          draggable: false,
          selectable: true,
          data: {
            kind: 'organization',
            orgId: org.id,
            name: org.name,
            slug: org.slug,
            subscriptionTier: org.subscription_tier,
            facilityCount: org.facility_count,
            staffCount: org.staff_count,
            countyName: org.county_name,
            isActive: org.is_active,
          },
        } satisfies Node<OrgChartNodeData>);
      });
    }

    // Place facility nodes between orgs and departments
    if (hasFacilities) {
      const facilityTotalWidth = facilities.length * (FACILITY_NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
      const facilityStartX = existingCenterX - facilityTotalWidth / 2;
      const facilityY = 40 + orgYOffset;

      facilities.forEach((facility, index) => {
        const facilityNodeId = `facility-${facility.id}`;
        nodes.push({
          id: facilityNodeId,
          type: 'facility',
          position: {
            x: facilityStartX + index * (FACILITY_NODE_WIDTH + HORIZONTAL_GAP),
            y: facilityY,
          },
          draggable: false,
          selectable: true,
          data: {
            kind: 'facility',
            facilityId: facility.id,
            orgId: facility.organization ?? 0,
            name: facility.name,
            mflCode: facility.mfl_code,
            level: facility.level,
            ownership: facility.ownership,
            countyName: facility.county_name,
            isHeadquarters: facility.is_headquarters,
            isActive: facility.is_active,
          },
        } satisfies Node<OrgChartNodeData>);

        // Connect facility to its organization
        if (facility.organization) {
          edges.push({
            id: `org-fac-edge-${facility.organization}-${facility.id}`,
            source: `org-${facility.organization}`,
            target: facilityNodeId,
            type: 'smoothstep',
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            style: { strokeWidth: 1.5, stroke: '#10b981' },
          });
        }
      });
    }

    // Connect root departments to facilities (inferred from staff primary_facility)
    // or fall back to org if no facility can be inferred
    if (hasFacilities) {
      const facilityIds = new Set(facilities.map((f) => f.id));

      // Build a map: departmentId → facilityId (by majority staff assignment)
      const deptFacilityVotes = new Map<number, Map<number, number>>();
      for (const staffMember of staff) {
        if (!staffMember.primary_department || !staffMember.primary_facility) continue;
        if (!facilityIds.has(staffMember.primary_facility)) continue;
        const votes = deptFacilityVotes.get(staffMember.primary_department) ?? new Map<number, number>();
        votes.set(staffMember.primary_facility, (votes.get(staffMember.primary_facility) ?? 0) + 1);
        deptFacilityVotes.set(staffMember.primary_department, votes);
      }

      const deptToFacility = new Map<number, number>();
      for (const [deptId, votes] of deptFacilityVotes) {
        let bestFacility = 0;
        let bestCount = 0;
        for (const [facId, count] of votes) {
          if (count > bestCount) {
            bestFacility = facId;
            bestCount = count;
          }
        }
        if (bestFacility) deptToFacility.set(deptId, bestFacility);
      }

      // Default facility for departments with no staff: use first facility
      const defaultFacilityId = facilities[0]?.id;

      for (const rootId of rootIds) {
        const inferredFacility = deptToFacility.get(rootId) ?? defaultFacilityId;
        if (inferredFacility && facilityIds.has(inferredFacility)) {
          edges.push({
            id: `fac-dept-edge-${inferredFacility}-${rootId}`,
            source: `facility-${inferredFacility}`,
            target: `department-${rootId}`,
            type: 'smoothstep',
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            style: { strokeWidth: 1.5, stroke: '#10b981' },
          });
        }
      }
    } else if (organizations.length === 1) {
      // No facilities loaded — fall back to connecting root depts to the org
      const firstOrg = organizations[0]!;
      const orgNodeId = `org-${firstOrg.id}`;
      for (const rootId of rootIds) {
        edges.push({
          id: `org-dept-edge-${firstOrg.id}-${rootId}`,
          source: orgNodeId,
          target: `department-${rootId}`,
          type: 'smoothstep',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          style: { strokeWidth: 1.5, stroke: '#6366f1' },
        });
      }
    }
  }

  return {
    nodes,
    edges,
    detailsById,
    staffById,
    firstDepartmentId: departments[0]?.id ?? null,
  };
}

function FlowFocusController({ focusNodeId }: { focusNodeId: string | null }) {
  const { getNode, setCenter } = useReactFlow<Node<OrgChartNodeData>, Edge>();

  useEffect(() => {
    if (!focusNodeId) {
      return;
    }

    const node = getNode(focusNodeId);
    if (!node) {
      return;
    }

    const estimatedWidth = node.type === 'staff' ? STAFF_NODE_WIDTH : DEPARTMENT_NODE_WIDTH;
    const estimatedHeight = node.type === 'staff' ? STAFF_NODE_HEIGHT : NODE_HEIGHT;
    setCenter(node.position.x + estimatedWidth / 2, node.position.y + estimatedHeight / 2, {
      zoom: node.type === 'staff' ? 0.85 : 0.72,
      duration: 300,
    });
  }, [focusNodeId, getNode, setCenter]);

  return null;
}

export function AdminOrgChart({
  departments,
  staff,
  organizations = [],
  facilities = [],
}: {
  departments: Department[];
  staff: StaffProfile[];
  organizations?: OrganizationListItem[];
  facilities?: FacilityListItem[];
}) {
  const [showInactive, setShowInactive] = useState(false);
  const [showStaffLines, setShowStaffLines] = useState(true);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const visibleStaff = useMemo(
    () =>
      staff.filter(
        (staffMember) =>
          !!staffMember.primary_department &&
          (showInactive || staffMember.employment_status === 'ACTIVE')
      ),
    [showInactive, staff]
  );

  const visibleDepartments = useMemo(
    () => (showInactive ? departments : departments.filter((department) => department.is_active)),
    [departments, showInactive]
  );

  const departmentSearchResults = useMemo<SearchResult[]>(() => {
    if (!deferredSearchQuery) {
      return [];
    }

    const departmentMatches = visibleDepartments
      .filter((department) => {
        const haystack = `${department.name} ${department.code} ${department.department_type_display}`.toLowerCase();
        return haystack.includes(deferredSearchQuery);
      })
      .slice(0, 5)
      .map((department) => ({
        kind: 'department' as const,
        id: department.id,
        label: department.name,
        description: `${department.code} • ${department.department_type_display}`,
        nodeId: `department-${department.id}`,
      }));

    const staffMatches = visibleStaff
      .filter((staffMember) => {
        const haystack = `${staffMember.full_name} ${staffMember.primary_role_name ?? ''} ${staffMember.primary_department_name ?? ''}`.toLowerCase();
        return haystack.includes(deferredSearchQuery);
      })
      .slice(0, 5)
      .map((staffMember) => ({
        kind: 'staff' as const,
        id: staffMember.id,
        departmentId: staffMember.primary_department!,
        label: staffMember.full_name,
        description: `${staffMember.primary_role_name ?? 'No role'} • ${staffMember.primary_department_name ?? 'No department'}`,
        nodeId: `staff-${staffMember.id}`,
      }));

    return [...departmentMatches, ...staffMatches].slice(0, 8);
  }, [deferredSearchQuery, visibleDepartments, visibleStaff]);

  const chart = useMemo(
    () => buildOrgChart(visibleDepartments, visibleStaff, organizations, facilities, selectedDepartmentId, showStaffLines),
    [selectedDepartmentId, showStaffLines, visibleDepartments, visibleStaff, organizations, facilities]
  );

  useEffect(() => {
    if (chart.firstDepartmentId === null) {
      setSelectedDepartmentId(null);
      return;
    }

    const hasSelected = selectedDepartmentId !== null && chart.detailsById.has(selectedDepartmentId);
    if (!hasSelected) {
      setSelectedDepartmentId(chart.firstDepartmentId);
      setSelectedStaffId(null);
    }
  }, [chart.detailsById, chart.firstDepartmentId, selectedDepartmentId]);

  useEffect(() => {
    if (selectedStaffId === null) {
      return;
    }

    const selectedStaff = chart.staffById.get(selectedStaffId);
    if (!selectedStaff || selectedStaff.primary_department !== selectedDepartmentId) {
      setSelectedStaffId(null);
    }
  }, [chart.staffById, selectedDepartmentId, selectedStaffId]);

  const selectedDetail = selectedDepartmentId === null
    ? null
    : chart.detailsById.get(selectedDepartmentId) ?? null;
  const selectedStaff = selectedStaffId === null ? null : chart.staffById.get(selectedStaffId) ?? null;

  const focusedDepartmentStaff = useMemo(
    () => visibleStaff.filter((staffMember) => staffMember.primary_department === selectedDepartmentId),
    [selectedDepartmentId, visibleStaff]
  );

  if (chart.nodes.length === 0) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
        <div className="space-y-2">
          <Network className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No departments available for the org chart.</p>
          <p className="text-sm text-muted-foreground">
            Create a department or enable inactive departments to populate this view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-2">
              <Label
                htmlFor="org-chart-search"
                className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
              >
                Find Department or Staff
              </Label>
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="org-chart-search"
                  name="orgChartSearch"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search departments or staff…"
                  aria-label="Search departments or staff"
                />
              </div>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Click a node to inspect it. Staff reporting lines appear for the selected department when staff lines are enabled.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={showInactive ? 'outline' : 'default'}
              onClick={() => {
                startTransition(() => setShowInactive(false));
              }}
            >
              Active Only
            </Button>
            <Button
              size="sm"
              variant={showInactive ? 'default' : 'outline'}
              onClick={() => {
                startTransition(() => setShowInactive(true));
              }}
            >
              Include Inactive
            </Button>
            <Button
              size="sm"
              variant={showStaffLines ? 'default' : 'outline'}
              onClick={() => {
                startTransition(() => setShowStaffLines((current) => !current));
              }}
            >
              {showStaffLines ? 'Hide Staff Lines' : 'Show Staff Lines'}
            </Button>
          </div>
        </div>

        {departmentSearchResults.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {departmentSearchResults.map((result) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                className="w-full rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-background"
                onClick={() => {
                  if (result.kind === 'department') {
                    setSelectedDepartmentId(result.id);
                    setSelectedStaffId(null);
                    setFocusNodeId(result.nodeId);
                  } else if (result.kind === 'staff') {
                    setShowStaffLines(true);
                    setSelectedDepartmentId(result.departmentId);
                    setSelectedStaffId(result.id);
                    setFocusNodeId(result.nodeId);
                  } else {
                    // organization
                    setFocusNodeId(result.nodeId);
                  }
                }}
              >
                <p className="truncate text-sm font-medium text-foreground">{result.label}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{result.description}</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Canvas: full width at every breakpoint */}
      <div className="h-[540px] overflow-hidden rounded-[28px] border border-border/70 sm:h-[580px] lg:h-[620px] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,118,110,0.08),transparent_30%),hsl(var(--background))]">
        <ReactFlow
          nodes={chart.nodes}
          edges={chart.edges}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.24 }}
          minZoom={0.35}
          maxZoom={1.4}
          onNodeClick={(_, node) => {
            if (node.data.kind === 'department') {
              setSelectedDepartmentId(node.data.departmentId);
              setSelectedStaffId(null);
              setFocusNodeId(node.id);
              return;
            }

            if (node.data.kind === 'staff') {
              setSelectedDepartmentId(node.data.departmentId);
              setSelectedStaffId(node.data.staffId);
              setFocusNodeId(node.id);
              return;
            }

            // organization node
            setFocusNodeId(node.id);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <FlowFocusController focusNodeId={focusNodeId} />
          <Background color="#1f2937" gap={24} size={1} />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={3}
            className="!hidden md:!block !rounded-2xl !border !border-border/70 !bg-background/90"
            nodeColor={(node) => {
              if (node.data?.kind === 'staff') {
                return '#0f766e';
              }
              if (node.data?.kind === 'facility') {
                return '#10b981';
              }
              if (node.data?.kind === 'organization') {
                return '#6366f1';
              }
              return node.data?.isActive ? '#0891b2' : '#94a3b8';
            }}
          />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      {/* Inspector: responsive detail bar below canvas */}
      {selectedDetail ? (
        <div className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 pb-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {selectedStaff ? 'Staff Focus' : 'Department Focus'}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {selectedStaff ? 'Selected Staff Profile' : 'Selected Department'}
              </p>
            </div>
            <Badge variant="outline">Inspector</Badge>
          </div>

          {selectedStaff ? (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {selectedStaff.full_name}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {selectedStaff.primary_role_name || 'Role not assigned'}
                    </p>
                  </div>
                  <Badge variant={selectedStaff.employment_status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {selectedStaff.employment_status || 'ACTIVE'}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedStaff.title ? <Badge variant="outline">{selectedStaff.title}</Badge> : null}
                  <Badge variant="secondary">{selectedStaff.employee_id}</Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    Department: {selectedStaff.primary_department_name || 'Not assigned'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>
                    Supervisor:{' '}
                    {selectedStaff.supervisor
                      ? chart.staffById.get(selectedStaff.supervisor)?.full_name || 'Assigned'
                      : 'Top-level in department'}
                  </span>
                </div>
              </div>

              <Button asChild className="self-start">
                <Link href={`/admin/staff/${selectedStaff.id}`}>
                  Open Staff Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {selectedDetail.department.name}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {selectedDetail.department.code}
                    </p>
                  </div>
                  <Badge variant={selectedDetail.department.is_active ? 'default' : 'secondary'}>
                    {selectedDetail.department.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedDetail.department.department_type_display}</Badge>
                  <Badge variant="secondary">{selectedDetail.department.staff_count} staff</Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span className="truncate">Head: {selectedDetail.headName || 'Not assigned'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Parent: {selectedDetail.parentName || 'Top-level department'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 shrink-0" />
                  <span>{selectedDetail.childCount} sub-departments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 shrink-0" />
                  <span>{selectedDetail.supervisorCoverage}% supervisor coverage</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>{focusedDepartmentStaff.length} staff in department</span>
                </div>
              </div>

              <Button asChild className="self-start">
                <Link href={`/admin/departments/${selectedDetail.department.id}`}>
                  Open Department
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
