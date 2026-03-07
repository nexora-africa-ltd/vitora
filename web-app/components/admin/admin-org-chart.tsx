'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowRight, Building2, GitBranch, Network, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { Department, StaffProfile } from '@/lib/types/rbac';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 138;
const HORIZONTAL_GAP = 84;
const VERTICAL_GAP = 228;

type OrgChartNodeData = {
  departmentId: number;
  name: string;
  code: string;
  departmentTypeDisplay: string;
  headName: string | null;
  staffCount: number;
  directReports: number;
  isActive: boolean;
};

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
  firstDepartmentId: number | null;
};

function DepartmentNode({ data, selected }: NodeProps<Node<OrgChartNodeData>>) {
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

const nodeTypes = {
  department: DepartmentNode,
};

function buildOrgChart(departments: Department[], staff: StaffProfile[]): ChartBuildResult {
  const departmentsById = new Map(departments.map((department) => [department.id, department]));
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
      const x = leafIndex * (NODE_WIDTH + HORIZONTAL_GAP);
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
    const x = leafIndex * (NODE_WIDTH + HORIZONTAL_GAP);
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
      data: {
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

  return {
    nodes,
    edges,
    detailsById,
    firstDepartmentId: departments[0]?.id ?? null,
  };
}

export function AdminOrgChart({
  departments,
  staff,
}: {
  departments: Department[];
  staff: StaffProfile[];
}) {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);

  const visibleDepartments = useMemo(
    () => (showInactive ? departments : departments.filter((department) => department.is_active)),
    [departments, showInactive]
  );

  const chart = useMemo(
    () => buildOrgChart(visibleDepartments, staff),
    [staff, visibleDepartments]
  );

  useEffect(() => {
    if (chart.firstDepartmentId === null) {
      setSelectedDepartmentId(null);
      return;
    }

    const hasSelected = selectedDepartmentId !== null && chart.detailsById.has(selectedDepartmentId);
    if (!hasSelected) {
      setSelectedDepartmentId(chart.firstDepartmentId);
    }
  }, [chart.detailsById, chart.firstDepartmentId, selectedDepartmentId]);

  const selectedDetail = selectedDepartmentId === null
    ? null
    : chart.detailsById.get(selectedDepartmentId) ?? null;

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
    <div className="h-[640px] overflow-hidden rounded-2xl border bg-background">
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
          setSelectedDepartmentId(node.data.departmentId);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#94a3b8" gap={20} size={1} />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={3}
          nodeColor={(node) => (node.data?.isActive ? '#0891b2' : '#94a3b8')}
        />
        <Controls showInteractive={false} position="bottom-right" />

        <Panel position="top-left" className="max-w-sm rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={showInactive ? 'outline' : 'default'}
              onClick={() => {
                startTransition(() => setShowInactive(false));
              }}
            >
              Active only
            </Button>
            <Button
              size="sm"
              variant={showInactive ? 'default' : 'outline'}
              onClick={() => {
                startTransition(() => setShowInactive(true));
              }}
            >
              Include inactive
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Department nodes are grouped by parent-child structure. Select a node to inspect leadership and reporting coverage.
          </p>
        </Panel>

        {selectedDetail ? (
          <Panel position="top-right" className="w-[300px] rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur">
            <div className="space-y-3">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedDetail.department.department_type_display}</Badge>
                  <Badge variant="secondary">{selectedDetail.department.staff_count} staff</Badge>
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
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
                  <span>{selectedDetail.childCount} direct sub-departments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 shrink-0" />
                  <span>{selectedDetail.supervisorCoverage}% supervisor coverage</span>
                </div>
              </div>

              <Button asChild className="w-full">
                <Link href={`/admin/departments/${selectedDetail.department.id}`}>
                  Open department
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}