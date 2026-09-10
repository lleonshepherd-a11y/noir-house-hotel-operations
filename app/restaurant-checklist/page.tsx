'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Moon, ShieldCheck, Sun, UtensilsCrossed } from 'lucide-react';

const DEPARTMENT = 'Restaurant';

type ChecklistGroup = 'Opening' | 'Service prep' | 'Closing';
type ChecklistItem = {
  key: string;
  label: string;
  group: ChecklistGroup;
  section?: string;
  method?: string;
  done: boolean;
  completedAt: string | null;
};

type Tab = 'Opening' | 'Closing';

export default function RestaurantChecklistPage() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [tab, setTab] = useState<Tab>('Opening');
  const [notice, setNotice] = useState('');
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    void fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()) as Promise<{ items: ChecklistItem[] }>)
      .then((data) => setItems(data.items))
      .catch(() => setNotice('Checklist could not be loaded.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toggle = async (item: ChecklistItem) => {
    if (pendingKeys.has(item.key)) return;
    setPendingKeys((current) => new Set(current).add(item.key));
    setItems((current) => current.map((c) => (c.key === item.key ? { ...c, done: !item.done } : c)));
    try {
      const response = item.done
        ? await fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}&itemKey=${encodeURIComponent(item.key)}`, { method: 'DELETE' })
        : await fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemKey: item.key }),
          });
      if (!response.ok) throw new Error();
      load();
    } catch {
      setItems((current) => current.map((c) => (c.key === item.key ? { ...c, done: item.done } : c)));
      setNotice('That change did not save — please try again.');
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(item.key);
        return next;
      });
    }
  };

  const tabItems = useMemo(() => items.filter((item) => item.group === tab), [items, tab]);
  const tabDone = tabItems.filter((item) => item.done).length;
  const sections = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, ChecklistItem[]>();
    tabItems.forEach((item) => {
      const key = item.section || tab;
      if (!bySection.has(key)) { bySection.set(key, []); order.push(key); }
      bySection.get(key)!.push(item);
    });
    return order.map((key) => ({ label: key, tasks: bySection.get(key)! }));
  }, [tabItems, tab]);

  return (
    <div className="rc-shell">
      <style>{`
        .rc-shell{--page:#eef0f4;--card:#ffffff;--line:#e5e7ec;--ink:#1c1e26;--ink-dim:#8b8d98;--ink-mid:#5a5c68;
          --blue:#3b5bfd;--blue-wash:#eef1ff;--green:#1fa971;--green-wash:#e7f8f0;--rose:#e0503f;--rose-wash:#fdeeec;
          min-height:100vh;background:var(--page);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Manrope',sans-serif;
          -webkit-font-smoothing:antialiased;padding:32px 20px 60px}
        .rc-shell *{box-sizing:border-box}
        .rc-wrap{max-width:900px;margin:0 auto}
        .rc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}
        .rc-eyebrow{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--blue)}
        .rc-header h1{margin:8px 0 4px;font-size:28px;font-weight:800;letter-spacing:-.02em}
        .rc-header p{margin:0;color:var(--ink-dim);font-size:14px}
        .rc-ring-pill{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:8px 16px 8px 8px;box-shadow:0 1px 2px rgba(20,22,30,.04);flex:none}
        .rc-ring-pill .ring{position:relative;width:36px;height:36px;flex:none}
        .rc-ring-pill .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
        .rc-ring-pill strong{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
        .rc-ring-pill span{display:block;font-size:9.5px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
        .rc-notice{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:11px 14px;border-radius:12px;background:var(--rose-wash);color:#a5372a;font-size:13px;font-weight:600}
        .rc-tabs{display:flex;gap:4px;margin-bottom:16px;padding:4px;border-radius:12px;background:#e2e4ea}
        .rc-tabs button{flex:1;border:0;border-radius:9px;padding:11px 8px;background:transparent;color:var(--ink-mid);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
        .rc-tabs button.active{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(20,22,30,.1)}
        .rc-card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(20,22,30,.05)}
        .rc-sheet-head{display:flex;align-items:baseline;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}
        .rc-sheet-head h2{margin:0;font-size:15px;font-weight:800}
        .rc-sheet-head span{font-size:13px;color:var(--ink-dim);font-weight:600;font-variant-numeric:tabular-nums}
        .rc-sheet-head span strong{color:var(--blue)}
        .rc-section-label{padding:14px 20px 6px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-dim)}
        .rc-row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
        .rc-row:last-child{border-bottom:0}
        .rc-row-main{flex:1;min-width:0}
        .rc-row-name{font-size:14px;font-weight:700;color:var(--ink)}
        .rc-row-name.done{color:var(--ink-dim);text-decoration:line-through;text-decoration-color:#c7c9d1}
        .rc-row-method{font-size:12px;color:var(--ink-dim);margin-top:2px}
        .rc-toggle{flex:none;width:36px;height:36px;border-radius:50%;border:1.5px solid var(--line);background:#fafbfd;display:flex;align-items:center;justify-content:center;cursor:pointer;color:transparent}
        .rc-toggle.done{background:var(--green);border-color:var(--green);color:#fff}
        .rc-empty{padding:24px 20px;text-align:center;color:var(--ink-dim);font-size:13px}
        footer.rc-foot{display:flex;align-items:center;gap:7px;justify-content:center;padding:20px 0 0;font-size:11px;color:var(--ink-dim)}
        @media(max-width:640px){.rc-header{flex-direction:column}.rc-row-method{display:none}}
      `}</style>

      <div className="rc-wrap">
        <div className="rc-header">
          <div>
            <div className="rc-eyebrow"><UtensilsCrossed size={13} /> Restaurant</div>
            <h1>{tab} checklist</h1>
            <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="rc-ring-pill">
            <div className="ring">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#eceef2" strokeWidth="4.5" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--blue)" strokeWidth="4.5" strokeLinecap="round"
                  strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - (tabItems.length ? tabDone / tabItems.length : 0))} />
              </svg>
            </div>
            <div><strong>{tabDone}/{tabItems.length}</strong><span>done</span></div>
          </div>
        </div>

        {notice && <div className="rc-notice"><ShieldCheck size={15} /> {notice}</div>}

        <div className="rc-tabs" role="tablist">
          <button className={tab === 'Opening' ? 'active' : ''} onClick={() => setTab('Opening')}><Sun size={15} /> Opening</button>
          <button className={tab === 'Closing' ? 'active' : ''} onClick={() => setTab('Closing')}><Moon size={15} /> Closing</button>
        </div>

        <div className="rc-card">
          <div className="rc-sheet-head">
            <h2>{tab} checklist</h2>
            <span><strong>{tabDone}</strong> of {tabItems.length} done</span>
          </div>
          {sections.map((section) => (
            <div key={section.label}>
              <div className="rc-section-label">{section.label}</div>
              {section.tasks.map((item) => (
                <div className="rc-row" key={item.key}>
                  <div className="rc-row-main">
                    <div className={`rc-row-name ${item.done ? 'done' : ''}`}>{item.label}</div>
                    {item.method && <div className="rc-row-method">{item.method}</div>}
                  </div>
                  <button className={`rc-toggle ${item.done ? 'done' : ''}`} onClick={() => toggle(item)} aria-label={item.label}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </button>
                </div>
              ))}
            </div>
          ))}
          {items.length === 0 && <div className="rc-empty">Loading checklist…</div>}
        </div>

        <footer className="rc-foot">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
          Resets every day
        </footer>
      </div>
    </div>
  );
}
