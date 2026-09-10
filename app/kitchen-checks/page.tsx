'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChefHat,
  Clock,
  Plus,
  Refrigerator,
  ShieldCheck,
  Snowflake,
  Thermometer,
} from 'lucide-react';

const DEPARTMENT = 'Kitchen';

type ChecklistGroup = 'Opening' | 'Service prep' | 'Closing';
type ChecklistItem = { key: string; label: string; group: ChecklistGroup; done: boolean; completedAt: string | null };

type FridgeUnit = {
  id: string;
  name: string;
  kind: 'fridge' | 'freezer';
  checkedToday: boolean;
  readingC: number | null;
  status: 'in_range' | 'above_range' | 'below_range' | null;
  loggedAt: string | null;
};

type FoodCheckType = 'cooking' | 'hot_holding' | 'cold_display' | 'delivery_chilled' | 'delivery_frozen';
type FoodTempLimit = { label: string; compare: 'min' | 'max'; limitC: number };
type FoodTempEntry = {
  id: string;
  checkType: FoodCheckType;
  itemName: string;
  supplier: string | null;
  readingC: number;
  inRange: boolean;
  packagingOk: boolean | null;
  useByOk: boolean | null;
  quantityOk: boolean | null;
  correctiveAction: string | null;
  loggedAt: string;
};

const FOOD_TEMP_TYPE_LABELS: Record<FoodCheckType, string> = {
  cooking: 'Cooking / reheating',
  hot_holding: 'Hot holding',
  cold_display: 'Cold food',
  delivery_chilled: 'Chilled delivery',
  delivery_frozen: 'Frozen delivery',
};
const FOOD_TEMP_IS_DELIVERY: Record<FoodCheckType, boolean> = {
  cooking: false, hot_holding: false, cold_display: false, delivery_chilled: true, delivery_frozen: true,
};

type Tab = 'checklist' | 'fridges' | 'food';

export default function KitchenChecksPage() {
  const [tab, setTab] = useState<Tab>('checklist');
  const [notice, setNotice] = useState('');

  // ---- Checklist ----
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const loadChecklist = useCallback(() => {
    void fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()) as Promise<{ items: ChecklistItem[] }>)
      .then((data) => setChecklistItems(data.items))
      .catch(() => setNotice('Checklist could not be loaded.'));
  }, []);

  const toggleChecklistItem = async (item: ChecklistItem) => {
    setChecklistItems((current) => current.map((c) => (c.key === item.key ? { ...c, done: !item.done } : c)));
    try {
      const response = item.done
        ? await fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}&itemKey=${encodeURIComponent(item.key)}`, { method: 'DELETE' })
        : await fetch(`/api/checklist?department=${encodeURIComponent(DEPARTMENT)}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemKey: item.key }),
          });
      if (!response.ok) throw new Error();
      loadChecklist();
    } catch {
      setChecklistItems((current) => current.map((c) => (c.key === item.key ? { ...c, done: item.done } : c)));
      setNotice('That change did not save — please try again.');
    }
  };

  // ---- Fridges & freezers ----
  const [units, setUnits] = useState<FridgeUnit[]>([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitKind, setNewUnitKind] = useState<'fridge' | 'freezer'>('fridge');
  const [readingDrafts, setReadingDrafts] = useState<Record<string, string>>({});
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);

  const loadUnits = useCallback(() => {
    void fetch(`/api/fridge-units?department=${encodeURIComponent(DEPARTMENT)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()) as Promise<{ units: FridgeUnit[] }>)
      .then((data) => setUnits(data.units))
      .catch(() => setNotice('Fridge & freezer list could not be loaded.'));
  }, []);

  const submitReading = async (unit: FridgeUnit) => {
    const readingC = Number(readingDrafts[unit.id]);
    if (Number.isNaN(readingC)) return;
    try {
      const response = await fetch(`/api/fridge-readings?department=${encodeURIComponent(DEPARTMENT)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unitId: unit.id, readingC }),
      });
      if (!response.ok) throw new Error();
      setReadingDrafts((current) => ({ ...current, [unit.id]: '' }));
      setOpenUnitId(null);
      loadUnits();
    } catch {
      setNotice('That reading did not save — please try again.');
    }
  };

  const addUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!newUnitName.trim()) return;
    try {
      const response = await fetch(`/api/fridge-units?department=${encodeURIComponent(DEPARTMENT)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newUnitName.trim(), kind: newUnitKind }),
      });
      if (!response.ok) throw new Error();
      setNewUnitName('');
      loadUnits();
    } catch {
      setNotice('Could not add that unit — please try again.');
    }
  };

  // ---- Food temperatures ----
  const [foodEntries, setFoodEntries] = useState<FoodTempEntry[]>([]);
  const [foodLimits, setFoodLimits] = useState<Partial<Record<FoodCheckType, FoodTempLimit>>>({});
  const [foodShowHistory, setFoodShowHistory] = useState(false);
  const [foodSubmitting, setFoodSubmitting] = useState(false);
  const [foodCheckType, setFoodCheckType] = useState<FoodCheckType>('cooking');
  const [foodItemName, setFoodItemName] = useState('');
  const [foodSupplier, setFoodSupplier] = useState('');
  const [foodReading, setFoodReading] = useState('');
  const [foodPackagingOk, setFoodPackagingOk] = useState(true);
  const [foodUseByOk, setFoodUseByOk] = useState(true);
  const [foodQuantityOk, setFoodQuantityOk] = useState(true);
  const [foodCorrectiveAction, setFoodCorrectiveAction] = useState('');

  const loadFoodTemps = useCallback(() => {
    void fetch(`/api/food-temps?department=${encodeURIComponent(DEPARTMENT)}&days=30&limit=100`)
      .then((r) => (r.ok ? r.json() : Promise.reject()) as Promise<{ entries: FoodTempEntry[]; limits: Record<FoodCheckType, FoodTempLimit> }>)
      .then((data) => { setFoodEntries(data.entries); setFoodLimits(data.limits); })
      .catch(() => setNotice('Food temperature log could not be loaded.'));
  }, []);

  const submitFoodTemp = async (event: FormEvent) => {
    event.preventDefault();
    if (foodSubmitting) return;
    const readingC = Number(foodReading);
    if (!foodItemName.trim() || Number.isNaN(readingC)) return;
    const isDelivery = FOOD_TEMP_IS_DELIVERY[foodCheckType];
    setFoodSubmitting(true);
    try {
      const response = await fetch(`/api/food-temps?department=${encodeURIComponent(DEPARTMENT)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          checkType: foodCheckType, itemName: foodItemName.trim(),
          supplier: isDelivery ? foodSupplier.trim() : undefined, readingC,
          packagingOk: isDelivery ? foodPackagingOk : undefined,
          useByOk: isDelivery ? foodUseByOk : undefined,
          quantityOk: isDelivery ? foodQuantityOk : undefined,
          correctiveAction: foodCorrectiveAction.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error();
      setFoodItemName(''); setFoodSupplier(''); setFoodReading('');
      setFoodPackagingOk(true); setFoodUseByOk(true); setFoodQuantityOk(true); setFoodCorrectiveAction('');
      loadFoodTemps();
    } catch {
      setNotice('That reading did not save — please try again.');
    } finally {
      setFoodSubmitting(false);
    }
  };

  useEffect(() => {
    loadChecklist(); loadUnits(); loadFoodTemps();
  }, [loadChecklist, loadUnits, loadFoodTemps]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const doneCount = checklistItems.filter((i) => i.done).length;
  const fridges = units.filter((u) => u.kind === 'fridge');
  const freezers = units.filter((u) => u.kind === 'freezer');

  return (
    <div className="kc-shell">
      <style>{`
        .kc-shell{--page:#eef0f4;--card:#ffffff;--line:#e5e7ec;--ink:#1c1e26;--ink-dim:#8b8d98;--ink-mid:#5a5c68;
          --blue:#3b5bfd;--blue-soft:#c6d0ff;--blue-wash:#eef1ff;--green:#1fa971;--green-wash:#e7f8f0;--rose:#e0503f;--rose-wash:#fdeeec;
          min-height:100vh;background:var(--page);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Manrope',sans-serif;
          -webkit-font-smoothing:antialiased;padding:28px 20px 60px}
        .kc-shell *{box-sizing:border-box}
        .kc-wrap{max-width:760px;margin:0 auto}
        .kc-header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
        .kc-header .icon{width:44px;height:44px;border-radius:13px;background:var(--blue-wash);color:var(--blue);display:flex;align-items:center;justify-content:center;flex:none}
        .kc-header h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
        .kc-header p{margin:2px 0 0;font-size:13px;color:var(--ink-dim)}
        .kc-tabs{display:flex;gap:4px;margin-bottom:16px;padding:4px;border-radius:12px;background:#e2e4ea}
        .kc-tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:9px;padding:10px 8px;background:transparent;color:var(--ink-mid);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
        .kc-tabs button.active{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(20,22,30,.1)}
        .kc-notice{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:11px 14px;border-radius:12px;background:var(--rose-wash);color:#a5372a;font-size:13px;font-weight:600}
        .kc-card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(20,22,30,.05)}
        .kc-card + .kc-card{margin-top:14px}
        .kc-card-head{display:flex;align-items:baseline;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line)}
        .kc-card-head h2{margin:0;font-size:15px;font-weight:800;display:flex;align-items:center;gap:7px}
        .kc-card-head span{font-size:13px;color:var(--ink-dim);font-weight:600}
        .kc-card-head span strong{color:var(--blue)}
        .kc-row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
        .kc-row:last-child{border-bottom:0}
        .kc-row-main{flex:1;min-width:0}
        .kc-row-main strong{display:block;font-size:14px;font-weight:700}
        .kc-row-main small{font-size:12px;color:var(--ink-dim)}
        .kc-toggle{flex:none;width:38px;height:38px;border-radius:12px;border:1.5px solid var(--line);background:#fafbfd;display:flex;align-items:center;justify-content:center;cursor:pointer;color:transparent}
        .kc-toggle.done{background:var(--green-wash);border-color:var(--green);color:var(--green)}
        .kc-badge{flex:none;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;white-space:nowrap}
        .kc-badge.ok{background:var(--green-wash);color:var(--green)}
        .kc-badge.bad{background:var(--rose-wash);color:var(--rose)}
        .kc-badge.pending{background:#f2f3f6;color:var(--ink-dim)}
        .kc-log-btn{flex:none;height:34px;padding:0 13px;border:1px solid var(--blue-wash);border-radius:10px;background:var(--blue-wash);color:var(--blue);font:inherit;font-weight:700;font-size:12.5px;cursor:pointer}
        .kc-inline-form{display:flex;gap:8px;padding:0 20px 16px;align-items:center}
        .kc-inline-form input{flex:1;font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:#fafbfd}
        .kc-inline-form button{height:36px;padding:0 14px;border:0;border-radius:10px;background:var(--blue);color:#fff;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer}
        .kc-add-unit{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:14px 20px;border-top:1px solid var(--line)}
        .kc-add-unit input,.kc-add-unit select{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:#fafbfd}
        .kc-add-unit button{height:38px;padding:0 14px;border:0;border-radius:10px;background:var(--ink);color:#fff;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:5px}
        .kc-food-form{display:grid;gap:10px;padding:16px 20px}
        .kc-food-form label{display:grid;gap:5px;font-size:11px;color:var(--ink-dim);font-weight:700}
        .kc-food-form input,.kc-food-form select{border:1px solid var(--line);border-radius:10px;background:#fafbfd;color:var(--ink);padding:9px 10px;font-size:13px;font:inherit}
        .kc-food-checks{display:grid;gap:7px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fafbfd}
        .kc-food-checks label{display:flex;flex-direction:row;align-items:center;gap:8px;font-size:12px;color:var(--ink-mid);font-weight:500;text-transform:none}
        .kc-preview{margin-top:-4px;font-size:11.5px;font-weight:700}
        .kc-preview.ok{color:var(--green)} .kc-preview.bad{color:var(--rose)}
        .kc-food-form button[type=submit]{height:40px;border:0;border-radius:10px;background:var(--blue);color:#fff;font:inherit;font-weight:700;font-size:13px;cursor:pointer}
        .kc-food-form button[type=submit]:disabled{opacity:.4;cursor:not-allowed}
        .kc-list-toggle{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-top:1px solid var(--line)}
        .kc-list-toggle span{font-size:11px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em}
        .kc-list-toggle button{border:1px solid var(--line);border-radius:999px;background:#fafbfd;color:var(--ink-mid);font-size:10.5px;font-weight:700;padding:6px 11px;cursor:pointer}
        .kc-entry{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:13px 20px;border-top:1px solid var(--line)}
        .kc-entry strong{font-size:13px}
        .kc-entry .meta{font-size:11px;color:var(--ink-dim)}
        .kc-entry .reading{text-align:right;font-weight:800;font-size:14px}
        .kc-entry .status{grid-column:2;text-align:right;font-size:10px;font-weight:700}
        .kc-entry .status.ok{color:var(--green)} .kc-entry .status.bad{color:var(--rose)}
        .kc-empty{padding:24px 20px;text-align:center;color:var(--ink-dim);font-size:13px}
        @media(max-width:520px){.kc-add-unit{grid-template-columns:1fr}}
      `}</style>

      <div className="kc-wrap">
        <div className="kc-header">
          <div className="icon"><ChefHat size={22} /></div>
          <div>
            <h1>Kitchen checks</h1>
            <p>Daily checklist, fridge &amp; freezer readings, food temperature log</p>
          </div>
        </div>

        {notice && <div className="kc-notice"><ShieldCheck size={15} /> {notice}</div>}

        <div className="kc-tabs" role="tablist">
          <button className={tab === 'checklist' ? 'active' : ''} onClick={() => setTab('checklist')}><Check size={14} /> Checklist</button>
          <button className={tab === 'fridges' ? 'active' : ''} onClick={() => setTab('fridges')}><Refrigerator size={14} /> Fridges &amp; freezers</button>
          <button className={tab === 'food' ? 'active' : ''} onClick={() => setTab('food')}><Thermometer size={14} /> Food temps</button>
        </div>

        {tab === 'checklist' && (
          <div className="kc-card">
            <div className="kc-card-head">
              <h2>Today&rsquo;s checklist</h2>
              <span><strong>{doneCount}</strong> of {checklistItems.length} done</span>
            </div>
            {checklistItems.map((item) => (
              <div className="kc-row" key={item.key}>
                <div className="kc-row-main">
                  <strong>{item.label}</strong>
                  <small>{item.group}{item.done && item.completedAt ? ` · Done ${new Date(item.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small>
                </div>
                <button className={`kc-toggle ${item.done ? 'done' : ''}`} onClick={() => toggleChecklistItem(item)} aria-label={item.label}>
                  <Check size={17} />
                </button>
              </div>
            ))}
            {checklistItems.length === 0 && <div className="kc-empty">Loading checklist…</div>}
          </div>
        )}

        {tab === 'fridges' && (
          <>
            <div className="kc-card">
              <div className="kc-card-head"><h2><Refrigerator size={16} /> Fridges</h2></div>
              {fridges.map((unit) => (
                <div key={unit.id}>
                  <div className="kc-row">
                    <div className="kc-row-main">
                      <strong>{unit.name}</strong>
                      <small>{unit.checkedToday ? `Logged ${unit.readingC}°C` : 'Not checked yet today'}</small>
                    </div>
                    <span className={`kc-badge ${unit.status === null ? 'pending' : unit.status === 'in_range' ? 'ok' : 'bad'}`}>
                      {unit.status === null ? 'Pending' : unit.status === 'in_range' ? 'In range' : 'Out of range'}
                    </span>
                    <button className="kc-log-btn" onClick={() => setOpenUnitId(openUnitId === unit.id ? null : unit.id)}>Log</button>
                  </div>
                  {openUnitId === unit.id && (
                    <div className="kc-inline-form">
                      <input type="number" step="0.1" inputMode="decimal" placeholder="Reading °C" value={readingDrafts[unit.id] ?? ''}
                        onChange={(e) => setReadingDrafts((c) => ({ ...c, [unit.id]: e.target.value }))} />
                      <button onClick={() => submitReading(unit)}>Save</button>
                    </div>
                  )}
                </div>
              ))}
              {fridges.length === 0 && <div className="kc-empty">No fridges added yet.</div>}
            </div>

            <div className="kc-card">
              <div className="kc-card-head"><h2><Snowflake size={16} /> Freezers</h2></div>
              {freezers.map((unit) => (
                <div key={unit.id}>
                  <div className="kc-row">
                    <div className="kc-row-main">
                      <strong>{unit.name}</strong>
                      <small>{unit.checkedToday ? `Logged ${unit.readingC}°C` : 'Not checked yet today'}</small>
                    </div>
                    <span className={`kc-badge ${unit.status === null ? 'pending' : unit.status === 'in_range' ? 'ok' : 'bad'}`}>
                      {unit.status === null ? 'Pending' : unit.status === 'in_range' ? 'In range' : 'Out of range'}
                    </span>
                    <button className="kc-log-btn" onClick={() => setOpenUnitId(openUnitId === unit.id ? null : unit.id)}>Log</button>
                  </div>
                  {openUnitId === unit.id && (
                    <div className="kc-inline-form">
                      <input type="number" step="0.1" inputMode="decimal" placeholder="Reading °C" value={readingDrafts[unit.id] ?? ''}
                        onChange={(e) => setReadingDrafts((c) => ({ ...c, [unit.id]: e.target.value }))} />
                      <button onClick={() => submitReading(unit)}>Save</button>
                    </div>
                  )}
                </div>
              ))}
              {freezers.length === 0 && <div className="kc-empty">No freezers added yet.</div>}

              <form className="kc-add-unit" onSubmit={addUnit}>
                <input placeholder="New unit name, e.g. Fridge 16" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} />
                <select value={newUnitKind} onChange={(e) => setNewUnitKind(e.target.value as 'fridge' | 'freezer')}>
                  <option value="fridge">Fridge</option>
                  <option value="freezer">Freezer</option>
                </select>
                <button type="submit"><Plus size={14} /> Add</button>
              </form>
            </div>
          </>
        )}

        {tab === 'food' && (
          <div className="kc-card">
            <form className="kc-food-form" onSubmit={submitFoodTemp}>
              <label>Check type
                <select value={foodCheckType} onChange={(e) => setFoodCheckType(e.target.value as FoodCheckType)}>
                  {(Object.keys(FOOD_TEMP_TYPE_LABELS) as FoodCheckType[]).map((type) => (
                    <option key={type} value={type}>{FOOD_TEMP_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </label>
              <label>{FOOD_TEMP_IS_DELIVERY[foodCheckType] ? 'Delivery / item' : 'Food item'}
                <input value={foodItemName} onChange={(e) => setFoodItemName(e.target.value)} placeholder="e.g. Chicken breast" />
              </label>
              {FOOD_TEMP_IS_DELIVERY[foodCheckType] && (
                <label>Supplier
                  <input value={foodSupplier} onChange={(e) => setFoodSupplier(e.target.value)} placeholder="e.g. Fresh Foods Ltd" />
                </label>
              )}
              <label>Reading (°C)
                <input type="number" step="0.1" inputMode="decimal" value={foodReading} onChange={(e) => setFoodReading(e.target.value)} placeholder="0.0" />
              </label>
              {foodReading !== '' && !Number.isNaN(Number(foodReading)) && (
                <small className={`kc-preview ${foodWithinLimit(foodCheckType, Number(foodReading), foodLimits) ? 'ok' : 'bad'}`}>
                  {foodWithinLimit(foodCheckType, Number(foodReading), foodLimits) ? 'Within limit' : 'Out of limit — record a corrective action'}
                </small>
              )}
              {FOOD_TEMP_IS_DELIVERY[foodCheckType] && (
                <div className="kc-food-checks">
                  <label><input type="checkbox" checked={foodPackagingOk} onChange={(e) => setFoodPackagingOk(e.target.checked)} /> Packaging intact</label>
                  <label><input type="checkbox" checked={foodUseByOk} onChange={(e) => setFoodUseByOk(e.target.checked)} /> Use-by dates OK</label>
                  <label><input type="checkbox" checked={foodQuantityOk} onChange={(e) => setFoodQuantityOk(e.target.checked)} /> Quantity matches order</label>
                </div>
              )}
              <label>Corrective action (if out of limit)
                <input value={foodCorrectiveAction} onChange={(e) => setFoodCorrectiveAction(e.target.value)} placeholder="Optional" />
              </label>
              <button type="submit" disabled={foodSubmitting || !foodItemName.trim() || foodReading === ''}>Log reading</button>
            </form>

            <div className="kc-list-toggle">
              <span>{foodShowHistory ? 'All records' : "Today's records"}</span>
              <button type="button" onClick={() => setFoodShowHistory((v) => !v)}>{foodShowHistory ? 'Show today only' : 'View history'}</button>
            </div>
            {foodEntries
              .filter((entry) => foodShowHistory || entry.loggedAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
              .map((entry) => (
                <div className="kc-entry" key={entry.id}>
                  <strong>{entry.itemName}</strong>
                  <span className="reading">{entry.readingC}°C</span>
                  <span className="meta">{FOOD_TEMP_TYPE_LABELS[entry.checkType]}{entry.supplier ? ` · ${entry.supplier}` : ''} · <Clock size={10} style={{ verticalAlign: 'middle' }} /> {new Date(entry.loggedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`status ${entry.inRange ? 'ok' : 'bad'}`}>{entry.inRange ? 'OK' : 'Out of limit'}</span>
                </div>
              ))}
            {foodEntries.length === 0 && <div className="kc-empty">No readings logged yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function foodWithinLimit(checkType: FoodCheckType, readingC: number, limits: Partial<Record<FoodCheckType, FoodTempLimit>>) {
  const limit = limits[checkType];
  if (!limit) return true;
  return limit.compare === 'min' ? readingC >= limit.limitC : readingC <= limit.limitC;
}
