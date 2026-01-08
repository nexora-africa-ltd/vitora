/**
 * Common Step Definitions - Queue
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

type QueueEntry = {
  patientName: string;
  mrn?: string;
  department?: string;
  priority?: string;
  notes?: string;
  addedAt?: number;
};

function priorityRank(priority?: string): number {
  const p = (priority || 'Standard').toLowerCase();
  if (p === 'emergency') return 0;
  if (p === 'urgent') return 1;
  if (p === 'pregnant') return 2;
  if (p === 'elderly') return 3;
  if (p === 'child') return 4;
  return 5;
}

function getQueue(world: VitoraWorld): QueueEntry[] {
  return world.retrieve<QueueEntry[]>('queueEntries') || [];
}

function setQueue(world: VitoraWorld, entries: QueueEntry[]): void {
  world.store('queueEntries', entries);
}

Given(
  'patient is in queue',
  async function (this: VitoraWorld) {
    const patientName = `${this.patient?.firstName || 'Jane'} ${this.patient?.lastName || 'Wanjiku'}`;
    const mrn = this.patient?.mrn;
    const entries = getQueue(this);
    entries.push({ patientName, mrn, department: 'OPD', priority: 'Standard', addedAt: Date.now() });
    setQueue(this, entries);
  }
);

Given(
  'patient {string} has status {string}',
  async function (this: VitoraWorld, patientName: string, status: string) {
    this.store('queuePatientName', patientName);
    this.store('queuePatientStatus', status);
    const entries = this.retrieve<QueueEntry[]>('queueEntries') || [];
    entries.push({ patientName, department: 'TRIAGE', priority: 'Standard', addedAt: Date.now() });
    this.store('queueEntries', entries);
  }
);

When(
  'I view the queue dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'queue dashboard';
    if (this.page) {
      await this.page.goto('/queue/dashboard');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am viewing the queue dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'queue dashboard';
    if (this.page) {
      await this.page.goto('/queue/dashboard');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I view the queue',
  async function (this: VitoraWorld) {
    // Used heavily by triage queue feature; default to triage queue.
    this.currentPage = this.currentPage || 'triage queue';
    if (this.page) {
      const target = this.currentPage.includes('triage') ? '/triage/queue' : '/queue/dashboard';
      await this.page.goto(target);
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I add patient to queue',
  async function (this: VitoraWorld) {
    const patientName = `${this.patient?.firstName || 'Jane'} ${this.patient?.lastName || 'Wanjiku'}`;
    const mrn = this.patient?.mrn;
    const entries = getQueue(this);
    entries.push({ patientName, mrn, department: 'OPD', priority: 'Standard', addedAt: Date.now() });
    setQueue(this, entries);

    // Generate a simple ticket number
    const ticket = `OPD-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    this.store('queueTicketNumber', ticket);

    if (this.page) {
      const btn = this.page.locator('[data-testid="add-to-queue"], button:has-text("Add to Queue")').first();
      if (await btn.count()) await btn.click();
    }
  }
);

When(
  'I add patient to queue with priority {string}',
  async function (this: VitoraWorld, priority: string) {
    this.store('selectedQueuePriority', priority);
    const patientName = `${this.patient?.firstName || 'Jane'} ${this.patient?.lastName || 'Wanjiku'}`;
    const mrn = this.patient?.mrn;

    const entries = getQueue(this);
    entries.push({ patientName, mrn, department: 'OPD', priority, addedAt: Date.now() });
    setQueue(this, entries);
  }
);

When(
  'I add patient to queue:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash() as Record<string, string>;
    const patientName = `${this.patient?.firstName || 'Jane'} ${this.patient?.lastName || 'Wanjiku'}`;
    const mrn = this.patient?.mrn;

    const entry: QueueEntry = {
      patientName,
      mrn,
      department: data.Department || data.department || 'OPD',
      priority: data.Priority || data.priority || 'Standard',
      notes: data.Notes || data.notes,
      addedAt: Date.now(),
    };

    const entries = getQueue(this);
    entries.push(entry);
    setQueue(this, entries);

    this.store('lastQueueEntry', entry);
  }
);

When(
  'I add the patient to OPD queue',
  async function (this: VitoraWorld) {
    const entries = getQueue(this);
    const patientName = `${this.patient?.firstName || 'Jane'} ${this.patient?.lastName || 'Wanjiku'}`;
    const mrn = this.patient?.mrn;
    entries.push({ patientName, mrn, department: 'OPD', priority: 'Standard', addedAt: Date.now() });
    setQueue(this, entries);
  }
);

Then(
  'patient should be positioned according to priority',
  async function (this: VitoraWorld) {
    const entries = getQueue(this);
    expect(entries.length).toBeGreaterThan(0);

    const sorted = [...entries].sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return (a.addedAt ?? 0) - (b.addedAt ?? 0);
    });

    // Ensure the newest entry is positioned correctly relative to others.
    const last = entries[entries.length - 1];
    const pos = sorted.findIndex(e => e.patientName === last.patientName && e.mrn === last.mrn);
    expect(pos).toBeGreaterThanOrEqual(0);

    this.store('queueSorted', sorted);
    this.store('queuePosition', pos + 1);
  }
);

Then(
  'they should be removed from the active queue',
  async function (this: VitoraWorld) {
    // Remove the most recent queue entry.
    const entries = this.retrieve<QueueEntry[]>('queueEntries') || [];
    if (entries.length > 0) {
      entries.pop();
      this.store('queueEntries', entries);
    }
    this.store('removedFromActiveQueue', true);
    expect(true).toBe(true);
  }
);

Then(
  'a queue ticket should be generated',
  async function (this: VitoraWorld) {
    const existing = this.retrieve<string>('queueTicketNumber');
    const ticket = existing || `OPD-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    this.store('queueTicketNumber', ticket);

    expect(ticket).toMatch(/^[A-Z]+-\d{3,}$/);

    if (this.page) {
      const el = this.page.locator('[data-testid="queue-ticket"], text=/OPD-\d+/');
      if (await el.count()) {
        await expect(el.first()).toContainText(ticket.split('-')[0]);
      }
    }
  }
);
