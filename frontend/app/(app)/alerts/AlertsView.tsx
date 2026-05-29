'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/nav/Topbar';
import { Icon } from '@/components/shared/Icon';
import type { CaseRow, CaseStatus } from '@/lib/cases-shared';

const STATUS_LABEL: Record<CaseStatus, [string, string]> = {
  'new':         ['complete', 'New'],
  'in-progress': ['pending',  'In Progress'],
  'escalated':   ['flagged',  'Escalated'],
  'closed':      ['complete', 'Closed'],
};

const fmtINR = (n: number) => '₹' + n.toLocaleString('en-IN');
const ringColor = (s: number) =>
  s >= 80 ? 'var(--danger)' : s >= 60 ? 'var(--warn)' : 'var(--approved)';

type SortKey = 'priority' | 'amount' | 'collapsed';

interface FilterState {
  priority: string;
  status:   string;
  overdue:  string;
  date:     string;
}

export default function AlertsView({ cases }: { cases: CaseRow[] }) {
  const [filter, setFilter]   = useState<FilterState>({ priority: 'All', status: 'All', overdue: 'All', date: 'Last 24h' });
  const [sort, setSort]       = useState<SortKey>('priority');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery]     = useState('');

  const rows = useMemo(() => {
    let list: CaseRow[] = cases;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.primaryAlert.toLowerCase().includes(q) ||
        r.masked.toLowerCase().includes(q) ||
        r.bank.toLowerCase().includes(q));
    }
    if (filter.status !== 'All') {
      const key = filter.status.toLowerCase().replace(' ', '-') as CaseStatus;
      list = list.filter(r => r.status === key);
    }
    if (filter.priority === '≥90')   list = list.filter(r => r.priority >= 90);
    if (filter.priority === '75–89') list = list.filter(r => r.priority >= 75 && r.priority < 90);
    if (filter.priority === '<75')   list = list.filter(r => r.priority < 75);
    if (filter.overdue === 'Overdue only') list = list.filter(r => r.overdue);

    list = [...list];
    if (sort === 'priority')  list.sort((a, b) => b.priority - a.priority);
    if (sort === 'amount')    list.sort((a, b) => b.amount - a.amount);
    if (sort === 'collapsed') list.sort((a, b) => b.collapsed - a.collapsed);
    return list;
  }, [filter, sort, query, cases]);

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSel = selected.size === rows.length && rows.length > 0;

  const totalOpen   = cases.filter(c => c.status !== 'closed').length;
  const pending     = cases.filter(c => c.status === 'new').length;
  const overdueCt   = cases.filter(c => c.overdue).length;
  const totalAlerts = cases.reduce((s, c) => s + c.collapsed, 0);

  return (
    <>
      <Topbar
        title="Case queue"
        subtitle="Investigator workload. Each case bundles every related alert into a single investigation unit."
        breadcrumbs={[{ label: 'Home' }, { label: 'Cases' }]}
      >
        <button className="btn btn--ghost"><Icon name="export" size={14} /> Export</button>
        <button className="btn btn--brand"><Icon name="spark" size={14} /> Run model now</button>
      </Topbar>

      <div className="page__body">
        <div className="alert-banner">
          <div className="alert-stat alert-stat--accent">
            <span className="alert-stat__lbl">Open cases</span>
            <span className="alert-stat__val">{totalOpen}</span>
            <span className="alert-stat__delta">{totalAlerts} alerts collapsed → {totalOpen} cases</span>
          </div>
          <div className="alert-stat">
            <span className="alert-stat__lbl">Pending first action</span>
            <span className="alert-stat__val" style={{ color: 'var(--brand-2)' }}>{pending}</span>
            <span className="alert-stat__delta">awaiting investigator pickup</span>
          </div>
          <div className="alert-stat">
            <span className="alert-stat__lbl">Overdue for escalation</span>
            <span className="alert-stat__val" style={{ color: 'var(--danger)' }}>{overdueCt}</span>
            <span className="alert-stat__delta is-down">SLA breached</span>
          </div>
          <div className="alert-stat">
            <span className="alert-stat__lbl">Assigned to me</span>
            <span className="alert-stat__val">4</span>
            <span className="alert-stat__delta">2 require action today</span>
          </div>
        </div>

        <div className="q-filters">
          {([
            ['Priority', 'priority', ['All', '≥90', '75–89', '<75']],
            ['Status',   'status',   ['All', 'New', 'In Progress', 'Escalated', 'Closed']],
            ['SLA',      'overdue',  ['All', 'Overdue only']],
            ['Date',     'date',     ['Last 24h', 'Last 7d', 'Last 30d', 'Custom']],
          ] as const).map(([label, key, opts]) => (
            <FilterDropdown
              key={key}
              label={label}
              value={filter[key]}
              options={opts as readonly string[]}
              onChange={(v) => setFilter({ ...filter, [key]: v })}
            />
          ))}
          <div className="q-search">
            <Icon name="search" size={16} />
            <input
              placeholder="Search case ID, account, or bank…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            background: 'var(--brand-soft)', borderRadius: 10, border: '1px solid var(--brand)',
          }}>
            <span style={{ color: 'var(--brand-2)', fontWeight: 700, fontSize: 13 }}>
              {selected.size} cases selected
            </span>
            <span className="spacer" />
            <button className="btn btn--ghost btn--sm">Assign…</button>
            <button className="btn btn--ghost btn--sm">Mark in progress</button>
            <button className="btn btn--brand btn--sm">Bulk escalate</button>
            <button className="icon-btn" onClick={() => setSelected(new Set())}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <div className="q-table">
          <div className="q-row is-head">
            <span
              className={'cb ' + (allSel ? 'on' : '')}
              onClick={() => setSelected(allSel ? new Set() : new Set(rows.map(r => r.id)))}
            >
              {allSel && <Icon name="check" size={12} />}
            </span>
            <span style={{ cursor: 'pointer' }} onClick={() => setSort('priority')}>
              Priority {sort === 'priority' && '↓'}
            </span>
            <span>Case</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setSort('collapsed')}>
              Alerts {sort === 'collapsed' && '↓'}
            </span>
            <span>Top rule</span>
            <span style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => setSort('amount')}>
              Amount {sort === 'amount' && '↓'}
            </span>
            <span>Age · SLA</span>
            <span>Status</span>
            <span>Assigned</span>
            <span />
          </div>
          {rows.map(r => (
            <CaseRowItem
              key={r.id}
              row={r}
              selected={selected.has(r.id)}
              onToggle={() => toggleSel(r.id)}
            />
          ))}
          {rows.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>
              No cases match these filters.
            </div>
          )}
        </div>

        <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Showing <b>{rows.length}</b> of <b>{cases.length}</b> open cases · sorted by <b>{sort}</b>
          </span>
          <div className="rail__pager">
            <button className="arr">‹</button>
            <button className="pg is-active">1</button>
            <button className="pg">2</button>
            <button className="pg">3</button>
            <button className="pg">…</button>
            <button className="pg">22</button>
            <button className="arr">›</button>
          </div>
        </div>
      </div>
    </>
  );
}

interface CaseRowItemProps {
  row: CaseRow;
  selected: boolean;
  onToggle: () => void;
}

function CaseRowItem({ row, selected, onToggle }: CaseRowItemProps) {
  const pct = Math.min(100, row.priority);
  const [statusKey, label] = STATUS_LABEL[row.status];
  return (
    <Link
      href={`/workspace?case=${row.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div className="q-row">
        <span
          className={'cb ' + (selected ? 'on' : '')}
          onClick={(e) => { e.preventDefault(); onToggle(); }}
        >
          {selected && <Icon name="check" size={12} />}
        </span>
        <span className="score">
          <span
            className="ring"
            style={{ ['--ring-pct' as string]: pct, ['--ring-color' as string]: ringColor(row.priority) } as React.CSSProperties}
          >
            <i>{row.priority}</i>
          </span>
        </span>
        <span className="acct">
          <b>{row.id} · {row.bank}</b>
          <span className="id">{row.primaryAlert} · {row.masked}</span>
        </span>
        <span className="rules">
          <span className="rule is-warn" style={{ background: 'var(--brand-soft)', color: 'var(--brand-2)' }}>
            {row.collapsed} alert{row.collapsed === 1 ? '' : 's'} → 1
          </span>
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>{row.topRule}</span>
        <span className="amt">{fmtINR(row.amount)}</span>
        <span className="when">
          {row.overdue
            ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>OVERDUE · {row.age}</span>
            : row.age}
        </span>
        <span className="stat">
          <span className={'status-pill ' + statusKey}>{label}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {row.assigned === 'Unassigned'
            ? <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>Unassigned</span>
            : row.assigned}
        </span>
        <button className="more" onClick={(e) => e.preventDefault()}>
          <Icon name="dots" size={14} />
        </button>
      </div>
    </Link>
  );
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setOpen(false)}>
      <button
        className={'q-filter ' + (value !== options[0] ? 'is-on' : '')}
        onClick={() => setOpen(!open)}
      >
        {label}: <b>{value}</b>
        <span className="chev"><Icon name="chev-d" size={12} /></span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 5,
          background: '#fff', border: '1px solid var(--line-strong)', borderRadius: 10,
          padding: 6, boxShadow: '0 16px 40px -16px rgba(20,24,43,.18)', minWidth: 160,
        }}>
          {options.map(o => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px',
                borderRadius: 7, border: 0, cursor: 'pointer',
                background: o === value ? 'var(--brand-soft)' : 'transparent',
                color: o === value ? 'var(--brand-2)' : 'var(--ink-2)',
                fontWeight: o === value ? 700 : 500,
                fontSize: 13,
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
