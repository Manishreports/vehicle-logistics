import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import type { AppState, MappingRule, PlanningRecord, StatusRecord, RaipurRecord } from '../types/models';
import { clearLocalState, loadLocalState, loadServerState, saveLocalState, saveServerState } from '../services/storage';
import { parseWorkbook } from '../services/workbookParser';
import { normalizeText } from '../domain/normalization';
import { parseHumanDate } from '../domain/date';
import { buildPage1Groups, buildPage2Groups } from '../domain/matchers';
import { derivePlanningView } from '../domain/synchronization';
import { buildIndexes } from '../domain/indexes';
import { page1Kpis, page2Kpis, plantWiseCfaDistribution, vehicleCallPending, vehicleCalledPlanPending, pendingSTOWorking, onloadingVehicles, vehiclePending } from '../domain/analytics';
import { downloadPdf, downloadWorkbook, rowsToTSV, copyText } from '../services/exporters';

type Page = 'planning' | 'status' | 'raipur' | 'dashboard';
const emptyState: AppState = { planningRecords: [], statusRecords: [], raipurRecords: [], gateRecords: [], mappings: [], settings: { loadingPoints: [] }, version: 1 };
const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

function App() {
  const [page, setPage] = useState<Page>('planning');
  const [state, setState] = useState<AppState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [planningSearch, setPlanningSearch] = useState('');
  const [statusSearch, setStatusSearch] = useState('');
  const [raipurSearch, setRaipurSearch] = useState('');
  const [planningFilter, setPlanningFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [today, setToday] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      const local = loadLocalState();
      const server = await loadServerState();
      if (!active) return;
      setState(server ?? local ?? emptyState);
      setHydrated(true);
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    saveLocalState(state);
    void saveServerState(state);
  }, [state, hydrated]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const indexes = useMemo(() => buildIndexes(state.planningRecords, state.statusRecords, state.gateRecords, state.raipurRecords, state.mappings), [state]);
  const planningView = useMemo(() => derivePlanningView(state.planningRecords, indexes, state.raipurRecords, state.mappings), [state.planningRecords, state.raipurRecords, state.mappings, indexes]);
  const page1Groups = useMemo(() => buildPage1Groups(planningView, state.mappings), [planningView, state.mappings]);
  const page2Groups = useMemo(() => buildPage2Groups(state.statusRecords, page1Groups, state.mappings), [state.statusRecords, page1Groups, state.mappings]);
  const callPending = useMemo(() => vehicleCallPending(page1Groups, page2Groups), [page1Groups, page2Groups]);
  const planPending = useMemo(() => vehicleCalledPlanPending(page2Groups), [page2Groups]);
  const kpi1 = useMemo(() => page1Kpis(page1Groups), [page1Groups]);
  const kpi2 = useMemo(() => page2Kpis(page2Groups, callPending, planPending), [page2Groups, callPending, planPending]);
  const distribution = useMemo(() => plantWiseCfaDistribution(page1Groups), [page1Groups]);
  const pendingSTO = useMemo(() => pendingSTOWorking(state.planningRecords, state.mappings), [state.planningRecords, state.mappings]);
  const onloading = useMemo(() => onloadingVehicles(page1Groups), [page1Groups]);
  const vehiclePendingRows = useMemo(() => vehiclePending(state.statusRecords, today, state.mappings), [state.statusRecords, today, state.mappings]);

  const filteredPlanning = useMemo(() => {
    let rows = page1Groups;
    if (planningFilter === 'Vehicle Call Pending') rows = callPending;
    else if (planningFilter && planningFilter !== 'Total Planned') rows = rows.filter((g) => g.status === planningFilter);
    if (planningSearch.trim()) {
      const q = planningSearch.toLowerCase();
      rows = rows.filter((g) => [g.date, g.cfa, g.loadingPoint, g.vehicleNumber, g.slips.join(' '), g.records.map((r) => r.sto).join(' ')].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [page1Groups, planningSearch, planningFilter]);
  const filteredStatus = useMemo(() => {
    let rows = page2Groups;
    if (statusFilter === 'Vehicle Call Pending') rows = callPending;
    else if (statusFilter === 'Vehicle called, Plan Pending') rows = planPending;
    else if (statusFilter && statusFilter !== 'Total Planned') rows = rows.filter((g) => g.status === statusFilter);
    if (statusSearch.trim()) {
      const q = statusSearch.toLowerCase();
      rows = rows.filter((g) => [g.demandDate, g.location, g.loadingPoint, g.vehicleNumber, g.slipNumbers.join(' ')].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [page2Groups, callPending, planPending, statusSearch, statusFilter]);
  const filteredRaipur = useMemo(() => {
    const q = raipurSearch.toLowerCase().trim();
    return q ? state.raipurRecords.filter((r) => [r.date, r.location, r.plant, r.cfa, r.stoNumbers.join(' '), r.loadingPoint, r.vehicleNumber, r.slipNumber].join(' ').toLowerCase().includes(q)) : state.raipurRecords;
  }, [state.raipurRecords, raipurSearch]);

  function setRecord<T extends Record<string, unknown>>(key: keyof AppState, id: string, patch: Partial<T>) {
    setState((s) => ({ ...s, [key]: (s[key] as unknown[]).map((r: unknown) => typeof r === 'object' && r && 'id' in r && (r as { id: string }).id === id ? { ...(r as object), ...patch, updatedAt: now() } : r) }));
  }
  function addPlanning() {
    const r: PlanningRecord = { id: rid(), date: parseHumanDate(draft.date), location: normalizeText(draft.location), plant: normalizeText(draft.plant), cfa: normalizeText(draft.cfa), weight: draft.weight ? Number(draft.weight) : null, sto: normalizeText(draft.sto), loadingPoint: normalizeText(draft.loadingPoint), vehicleIn: parseHumanDate(draft.vehicleIn), vehicleNumber: normalizeText(draft.vehicleNumber), vehicleOut: parseHumanDate(draft.vehicleOut), slipNumber: normalizeText(draft.slipNumber), status: 'Pending', source: 'manual', createdAt: now(), updatedAt: now() };
    if (r.vehicleIn && r.vehicleOut && r.vehicleOut < r.vehicleIn) return setToast('Invalid: Vehicle Out cannot be earlier than Vehicle In.');
    if (!r.date || !r.cfa || !r.loadingPoint || !r.sto) return setToast('Date, CFA, Loading Point and STO are required.');
    setState((s) => ({ ...s, planningRecords: [...s.planningRecords, r] })); setModal(null); setDraft({}); setToast('Plan added.');
  }
  function addStatus() {
    const r: StatusRecord = { id: rid(), demandDate: parseHumanDate(draft.demandDate), requiredDate: parseHumanDate(draft.requiredDate), location: normalizeText(draft.location), loadingPoint: normalizeText(draft.loadingPoint), weight: draft.weight ? Number(draft.weight) : null, vehicleNumber: normalizeText(draft.vehicleNumber), vehicleIn: parseHumanDate(draft.vehicleIn), vehicleOut: parseHumanDate(draft.vehicleOut), remark: normalizeText(draft.remark), status: 'Pending', createdAt: now(), updatedAt: now() };
    if (r.vehicleIn && r.vehicleOut && r.vehicleOut < r.vehicleIn) return setToast('Invalid: Vehicle Out cannot be earlier than Vehicle In.');
    if (!r.demandDate || !r.location || !r.loadingPoint) return setToast('Demand Date, Location and Loading Point are required.');
    if (r.remark === 'Dispatched to party' && (!r.vehicleIn || !r.vehicleOut)) return setToast('Dispatched to party requires both Vehicle In and Vehicle Out.');
    setState((s) => ({ ...s, statusRecords: [...s.statusRecords, r] })); setModal(null); setDraft({}); setToast('Vehicle call added.');
  }
  function addRaipur() {
    const r: RaipurRecord = { id: rid(), date: parseHumanDate(draft.date), location: normalizeText(draft.location), plant: normalizeText(draft.plant), cfa: normalizeText(draft.cfa), weight: draft.weight ? Number(draft.weight) : null, stoNumbers: normalizeText(draft.stoNumbers).split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean), loadingPoint: normalizeText(draft.loadingPoint), vehicleIn: parseHumanDate(draft.vehicleIn), vehicleNumber: normalizeText(draft.vehicleNumber), vehicleOut: parseHumanDate(draft.vehicleOut), slipNumber: normalizeText(draft.slipNumber), status: (draft.status as any) || 'Pending', createdAt: now(), updatedAt: now() };
    if (r.vehicleIn && r.vehicleOut && r.vehicleOut < r.vehicleIn) return setToast('Invalid: Vehicle Out cannot be earlier than Vehicle In.');
    setState((s) => ({ ...s, raipurRecords: [...s.raipurRecords, r] })); setModal(null); setDraft({}); setToast('Raipur record added.');
  }
  function confirmDelete(key: keyof AppState, id: string) {
    if (!confirm('Are you sure you want to delete this record?')) return;
    setState((s) => ({ ...s, [key]: (s[key] as { id: string }[]).filter((r) => r.id !== id) }));
  }
  async function resetAll() {
    if (!confirm('Are You Sure? This will clear all application data.')) return;
    setState(emptyState); clearLocalState(); await fetch('/api/reset', { method: 'POST' }).catch(() => undefined); setToast('Application reset completed.');
  }
  async function importWorkbook(file: File) {
    const parsed = parseWorkbook(await file.arrayBuffer());
    setState((s) => ({ ...s, gateRecords: parsed.gateRecords }));
    setModal(null);
    setToast(`Imported ${parsed.gateRecords.length} gate/event rows. ${parsed.warnings.length} warnings.`);
  }
  async function copyReport(headers: string[], rows: unknown[][]) {
    await copyText(rowsToTSV(headers, rows)); setToast('Copied as tab-separated Excel-ready text.');
  }
  function navTo(p: Page, filter?: string) { setPage(p); if (p === 'planning') { setPlanningFilter(filter ?? null); setStatusFilter(null); } else if (p === 'status') { setStatusFilter(filter ?? null); setPlanningFilter(null); } }

  if (!hydrated) return <div className="splash">Loading persisted data…</div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">VLCS</div>
      <div className="brand-sub">Vehicle Logistics Control</div>
      <nav>
        <button className={page === 'planning' ? 'active' : ''} onClick={() => navTo('planning')}>Vehicle Planning Sheet</button>
        <button className={page === 'status' ? 'active' : ''} onClick={() => navTo('status')}>Vehicle Status Tracking</button>
        <button className={page === 'raipur' ? 'active' : ''} onClick={() => navTo('raipur')}>Raipur Dataset</button>
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => navTo('dashboard')}>Dashboard & Analytics</button>
      </nav>
      <div className="sidebar-footer"><button onClick={() => setModal('import')}>Import Vehicle In/Out Excel</button><button className="danger" onClick={resetAll}>Reset Entire Application</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><h1>{page === 'planning' ? 'Vehicle Planning Sheet' : page === 'status' ? 'Vehicle Status Tracking' : page === 'raipur' ? 'Raipur Dataset' : 'Dashboard & Operational Analytics'}</h1><div className="muted">Offline-first • deterministic matching • source data preserved</div></div><div className="top-actions"><span className="pill">Plans {page1Groups.length}</span><span className="pill">Calls {page2Groups.length}</span><button onClick={() => setModal('mapping')}>Mappings</button></div></header>
      {page === 'planning' && <PlanningPage groups={filteredPlanning} kpi={kpi1} search={planningSearch} setSearch={setPlanningSearch} filter={planningFilter} setFilter={setPlanningFilter} onAdd={() => { setDraft({}); setModal('planning-add'); }} onEdit={(g) => { setDraft(g.records[0] as any); setModal(`planning-edit:${g.records[0].id}`); }} onDelete={(g) => confirmDelete('planningRecords', g.records[0].id)} />}
      {page === 'status' && <StatusPage groups={filteredStatus} kpi={kpi2} search={statusSearch} setSearch={setStatusSearch} filter={statusFilter} setFilter={setStatusFilter} onNavigate={(filter: string) => filter === 'Vehicle Call Pending' ? navTo('planning', 'Vehicle Call Pending') : navTo('status', filter === 'Vehicle called, Plan Pending' ? 'Vehicle called, Plan Pending' : filter)} onAdd={() => { setDraft({}); setModal('status-add'); }} onDelete={(g) => confirmDelete('statusRecords', g.records[0].id)} />}
      {page === 'raipur' && <RaipurPage rows={filteredRaipur} search={raipurSearch} setSearch={setRaipurSearch} onAdd={() => { setDraft({ status: 'Pending' }); setModal('raipur-add'); }} onDelete={(r) => confirmDelete('raipurRecords', r.id)} />}
      {page === 'dashboard' && <DashboardPage distribution={distribution} pendingSTO={pendingSTO} onloading={onloading} vehiclePendingRows={vehiclePendingRows} onCopy={copyReport} onPdf={downloadPdf} onExcel={downloadWorkbook} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
    {modal && <Modal title={modal.startsWith('planning') ? 'Vehicle Planning' : modal.startsWith('status') ? 'Vehicle Call' : modal.startsWith('raipur') ? 'Raipur Dataset' : modal === 'import' ? 'Combined Vehicle In / Vehicle Out Excel' : 'Manual Mapping'} onClose={() => setModal(null)}>
      {modal === 'import' && <ImportModal onImport={importWorkbook} />}
      {modal === 'planning-add' && <RecordForm kind="planning" draft={draft} setDraft={setDraft} onSubmit={addPlanning} />}
      {modal === 'status-add' && <RecordForm kind="status" draft={draft} setDraft={setDraft} onSubmit={addStatus} />}
      {modal === 'raipur-add' && <RecordForm kind="raipur" draft={draft} setDraft={setDraft} onSubmit={addRaipur} />}
      {modal === 'mapping' && <MappingModal mappings={state.mappings} setState={setState} />}
      {modal.startsWith('planning-edit:') && <EditPlanning id={modal.split(':')[1]} state={state} setState={setState} onClose={() => setModal(null)} />}
    </Modal>}
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{title}</h2><button onClick={onClose}>✕</button></div><div className="modal-body">{children}</div></div></div>; }
function RecordForm({ kind, draft, setDraft, onSubmit }: { kind: 'planning'|'status'|'raipur'; draft: Record<string,string>; setDraft: (d: Record<string,string>) => void; onSubmit: () => void }) { const f = (label: string, key: string, type = 'text') => <label>{label}<input type={type} value={draft[key] ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>; return <div className="form-grid">
  {kind === 'planning' && <>{f('Date','date','date')}{f('Location','location')}{f('Plant','plant')}{f('CFA','cfa')}{f('Weight','weight','number')}{f('STO','sto')}{f('Loading Point','loadingPoint')}{f('Vehicle In','vehicleIn','date')}{f('Vehicle Number','vehicleNumber')}{f('Vehicle Out','vehicleOut','date')}{f('Slip Number','slipNumber')}</>}
  {kind === 'status' && <>{f('Demand Date','demandDate','date')}{f('Required Date','requiredDate','date')}{f('Location','location')}{f('Loading Point','loadingPoint')}{f('Weight','weight','number')}{f('Remark','remark')}{f('Vehicle In','vehicleIn','date')}{f('Vehicle Number','vehicleNumber')}{f('Vehicle Out','vehicleOut','date')}</>}
  {kind === 'raipur' && <>{f('Date','date','date')}{f('Location','location')}{f('Plant','plant')}{f('CFA','cfa')}{f('Weight','weight','number')} {f('STO Number(s)','stoNumbers')} {f('Loading Point','loadingPoint')}{f('Vehicle In','vehicleIn','date')}{f('Vehicle Number','vehicleNumber')}{f('Vehicle Out','vehicleOut','date')}{f('Gate Slip','slipNumber')}{f('Status','status')}</>}
  <div className="form-actions"><button className="primary" onClick={onSubmit}>Save</button></div>
</div>; }
function ImportModal({ onImport }: { onImport: (file: File) => Promise<void> }) { const [file, setFile] = useState<File | null>(null); return <div><p className="muted">Supports one workbook with multiple sheets and separate/event-based Gate In/Gate Out rows. Existing gate data is replaced by this import.</p><input type="file" accept=".xlsx,.xls,.xlsb,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><div className="form-actions"><button className="primary" disabled={!file} onClick={() => file && void onImport(file)}>Import & Replace</button></div></div>; }
function MappingModal({ mappings, setState }: { mappings: MappingRule[]; setState: React.Dispatch<React.SetStateAction<AppState>> }) { const [source, setSource] = useState(''); const [target, setTarget] = useState(''); const [field, setField] = useState<MappingRule['field']>('location'); function add() { if (!source.trim() || !target.trim()) return; if (mappings.some((m) => m.field === field && m.source.trim().toLowerCase() === source.trim().toLowerCase())) return alert('Duplicate source mapping is not allowed.'); const m: MappingRule = { id: rid(), source: source.trim(), target: target.trim(), field }; setState((s) => ({ ...s, mappings: [...s.mappings, m] })); setSource(''); setTarget(''); } return <div><div className="mapping-form"><select value={field} onChange={(e) => setField(e.target.value as any)}><option value="location">Location</option><option value="loadingPoint">Loading Point</option><option value="cfa">CFA</option></select><input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} /><input placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} /><button onClick={add}>Add</button></div><table><thead><tr><th>Field</th><th>Source</th><th>Target</th><th></th></tr></thead><tbody>{mappings.map((m) => <tr key={m.id}><td>{m.field}</td><td>{m.source}</td><td>{m.target}</td><td><button onClick={() => setState((s) => ({ ...s, mappings: s.mappings.filter((x) => x.id !== m.id) }))}>Delete</button></td></tr>)}</tbody></table></div>; }
function EditPlanning({ id, state, setState, onClose }: { id: string; state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void }) { const r = state.planningRecords.find((x) => x.id === id); const [draft, setDraft] = useState<Record<string,string>>(r ? { ...r, weight: r.weight?.toString() ?? '' } : {}); if (!r) return <p>Record not found.</p>; const save = () => { if (!confirm('Are you sure you want to save these changes?')) return; const next: PlanningRecord = { ...r, date: parseHumanDate(draft.date), location: draft.location ?? '', plant: draft.plant ?? '', cfa: draft.cfa ?? '', weight: draft.weight ? Number(draft.weight) : null, sto: draft.sto ?? '', loadingPoint: draft.loadingPoint ?? '', vehicleIn: parseHumanDate(draft.vehicleIn), vehicleNumber: draft.vehicleNumber ?? '', vehicleOut: parseHumanDate(draft.vehicleOut), slipNumber: draft.slipNumber ?? '', updatedAt: now() }; if (next.vehicleIn && next.vehicleOut && next.vehicleOut < next.vehicleIn) return alert('Gate Out cannot be earlier than Gate In.'); setState((s) => ({ ...s, planningRecords: s.planningRecords.map((x) => x.id === id ? next : x) })); onClose(); }; return <RecordForm kind="planning" draft={draft} setDraft={setDraft} onSubmit={save} />; }

function KpiStrip({ items, active, setActive }: { items: {label:string,value:number,key:string}[]; active:string|null; setActive:(k:string|null)=>void }) { return <div className="kpis">{items.map((x) => <button key={x.key} className={active === x.key ? 'kpi active' : 'kpi'} onClick={() => setActive(active === x.key ? null : x.key)}><span>{x.label}</span><strong>{x.value}</strong></button>)}</div>; }
function PlanningPage({ groups, kpi, search, setSearch, filter, setFilter, onAdd, onEdit, onDelete }: any) { return <section><KpiStrip active={filter} setActive={setFilter} items={[{label:'Total Planned',value:kpi.totalPlanned,key:'Total Planned'},{label:'Pending Vehicles',value:kpi.pendingVehicles,key:'Pending'},{label:'On Loading',value:kpi.onLoading,key:'On Loading'},{label:'Cancelled',value:kpi.cancelled,key:'Cancelled'}]} /><div className="toolbar"><input placeholder="Search Page 1…" value={search} onChange={(e) => setSearch(e.target.value)} /><button className="primary" onClick={onAdd}>+ Add Plan</button></div><DataTable headers={['Date','Location','Plant','CFA','Weight','STO(s)','Loading Point','Vehicle In','Vehicle No.','Vehicle Out','Slip','Status','Actions']} rows={groups.map((g: any) => [g.date,g.locations.join(', '),g.plants.join(', '),g.cfa,g.weights.toString(),g.records.map((r:any)=>r.sto).join(', '),g.loadingPoint,g.vehicleIn || '-',g.vehicleNumber || '-',g.vehicleOut || '-',g.slips.join(', ') || '-',g.status,<span className="actions"><button onClick={() => onEdit(g)}>Edit</button><button onClick={() => onDelete(g)}>Delete</button></span>])} /><p className="table-note">Showing {groups.length} visible Page 1 plan groups.</p></section>; }
function StatusPage({ groups, kpi, search, setSearch, filter, setFilter, onNavigate, onAdd, onDelete }: any) {
  const items=[
    {label:'Total Planned',value:kpi.totalPlanned,key:'Total Planned'},
    {label:'Pending Vehicles',value:kpi.pendingVehicles,key:'Pending'},
    {label:'Vehicle Call Pending',value:kpi.vehicleCallPending,key:'Vehicle Call Pending'},
    {label:'Vehicle called, Plan Pending',value:kpi.vehicleCalledPlanPending,key:'Vehicle called, Plan Pending'},
    {label:'On Loading',value:kpi.onLoading,key:'On Loading'},
    {label:'Cancelled',value:kpi.cancelled,key:'Cancelled'}
  ];
  return <section><div className="kpis">{items.map((x:any)=><button key={x.key} className={filter===x.key?'kpi active':'kpi'} onClick={()=>{ if(x.key==='Vehicle Call Pending'||x.key==='Vehicle called, Plan Pending'){ onNavigate(x.key); return; } setFilter(filter===x.key?null:x.key); }}><span>{x.label}</span><strong>{x.value}</strong></button>)}</div><div className="toolbar"><input placeholder="Search Page 2…" value={search} onChange={(e:any)=>setSearch(e.target.value)} /><button className="primary" onClick={onAdd}>+ Add Vehicle Call</button></div><DataTable headers={['Demand Date','Required Date','Location','Loading Point','Weight','Vehicle In','Vehicle No.','Vehicle Out','Gate Slip','Status','Remark','Actions']} rows={groups.map((g:any) => [g.demandDate,g.records[0]?.requiredDate || '-',g.location,g.loadingPoint,g.records.reduce((s:any,r:any)=>s+(r.weight||0),0).toString(),g.vehicleIn||'-',g.vehicleNumber||'-',g.vehicleOut||'-',g.slipNumbers.join(', ')||'-',g.status,g.records.map((r:any)=>r.remark).filter(Boolean).join(', ')||'-',<button onClick={()=>onDelete(g)}>Delete</button>])} /><p className="table-note">KPI filters and search are local to Page 2.</p></section>;
}
function RaipurPage({ rows, search, setSearch, onAdd, onDelete }: any) { return <section><div className="toolbar"><input placeholder="Search Raipur…" value={search} onChange={(e) => setSearch(e.target.value)} /><button className="primary" onClick={onAdd}>+ Add Raipur Record</button></div><DataTable headers={['Date','Location','Plant','CFA','Weight','STO Number(s)','Loading Point','Vehicle In','Vehicle No.','Vehicle Out','Gate Slip','Status','Actions']} rows={rows.map((r:any) => [r.date,r.location,r.plant,r.cfa,r.weight ?? '-',r.stoNumbers.join(', '),r.loadingPoint,r.vehicleIn||'-',r.vehicleNumber||'-',r.vehicleOut||'-',r.slipNumber||'-',r.status,<button onClick={() => onDelete(r)}>Delete</button>])} /><p className="table-note">Raipur records are an isolated source/fallback dataset; they never append Page 1 or Page 2 rows.</p></section>; }
function DashboardPage({ distribution, pendingSTO, onloading, vehiclePendingRows, onCopy, onPdf, onExcel }: any) {
 const [dLimit,setDLimit]=useState('5'); const [cLimit,setCLimit]=useState('5');
 const dispatchedRows=pendingSTO.filter((x:any)=>x.category==='Vehicle dispatched, STO pending');
 const coreRows=pendingSTO.filter((x:any)=>x.category==='Core Pending');
 const limited=(rows:any[],limit:string)=>limit==='All'?rows:rows.slice(0,Number(limit));
 const dRows=limited(dispatchedRows,dLimit); const cRows=limited(coreRows,cLimit);
 const onloadHeaders=['Sr no.','Loading Point','CFA Name','Vehicle No.','Vehicle In Date']; const onloadRows=onloading.map((x:any)=>[x.srNo,x.loadingPoint,x.cfaName,x.vehicleNo,x.vehicleInDate]);
 const vehicleHeaders=['S No.','Demanded Date','Required Date','Loading Pt.','Location','Weight','Pending by']; const vehicleRows=vehiclePendingRows.map((x:any)=>[x.sNo,x.demandedDate,x.requiredDate,x.loadingPoint,x.location,x.weight??'-',x.pendingBy]);
 return <section><div className="dashboard-grid"><div className="card"><div className="card-head"><h2>Plant Wise Distribution</h2></div><div className="bars">{distribution.map((d:any)=><div className="bar-row" key={d.cfa}><span>{d.cfa}</span><div className="bar"><div style={{width:`${Math.min(100,d.count*12)}%`}}></div></div><strong>{d.count}</strong></div>)}</div></div><div className="card"><div className="card-head"><h2>Pending STO Working</h2></div><div className="mini-grid"><div><div className="report-toolbar"><strong>Vehicle dispatched, STO pending</strong><select value={dLimit} onChange={(e)=>setDLimit(e.target.value)}><option>5</option><option>10</option><option>20</option><option>All</option></select></div><ReportBlock rows={dRows} /></div><div><div className="report-toolbar"><strong>Core Pending</strong><select value={cLimit} onChange={(e)=>setCLimit(e.target.value)}><option>5</option><option>10</option><option>20</option><option>All</option></select></div><ReportBlock rows={cRows} /></div></div><div className="card-actions"><button onClick={()=>void onCopy(['STO Number'],dRows.map((x:any)=>[x.sto]))}>Copy Dispatched STO</button><button onClick={()=>void onCopy(['STO Number'],cRows.map((x:any)=>[x.sto]))}>Copy Core Pending STO</button></div></div><div className="card"><div className="card-head"><h2>Onloading Vehicle</h2></div><DataTable headers={onloadHeaders} rows={onloadRows}/><div className="card-actions"><button onClick={()=>void onCopy(onloadHeaders,onloadRows)}>Copy to Excel</button><button onClick={()=>onExcel('onloading-vehicle.xlsx',onloadHeaders,onloadRows,'Onloading')}>Excel</button><button onClick={()=>void onPdf('onloading-vehicle.pdf','Onloading Vehicle',onloadHeaders,onloadRows)}>PDF</button></div></div><div className="card"><div className="card-head"><h2>Vehicle Pending</h2></div><DataTable headers={vehicleHeaders} rows={vehicleRows}/><div className="card-actions"><button onClick={()=>void onCopy(vehicleHeaders,vehicleRows)}>Copy to Excel</button><button onClick={()=>onExcel('vehicle-pending.xlsx',vehicleHeaders,vehicleRows,'Vehicle Pending')}>Excel</button><button onClick={()=>void onPdf('vehicle-pending.pdf','Vehicle Pending',vehicleHeaders,vehicleRows)}>PDF</button></div></div></div></section>; }
function ReportBlock({ rows }: { rows: any[] }) { return <div className="report-block">{rows.length ? <ol>{rows.map((r)=><li key={r.sto}>{r.sto}</li>)}</ol> : <div className="empty">No records</div>}</div>; }
function DataTable({ headers, rows }: { headers: string[]; rows: any[][] }) { return <div className="table-wrap"><table><thead><tr>{headers.map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={headers.length} className="empty">No records</td></tr>}</tbody></table></div>; }

export default App;
