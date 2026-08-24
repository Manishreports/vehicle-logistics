export type STOStatus = 'Pending' | 'Arrived' | 'Dispatched' | 'Cancel' | 'Ignore';
export type Page1PlanStatus = 'Pending' | 'On Loading' | 'Dispatched' | 'Cancelled' | 'Ignore';
export type Page2Status = 'Pending' | 'On Loading' | 'Dispatched' | 'Cancelled' | 'Ignore';
export type DerivedOperationalStatus = 'Pending' | 'On Loading' | 'Dispatched' | 'Cancelled' | 'Ignore';

export interface PlanningRecord {
  id: string;
  date: string;
  location: string;
  plant: string;
  cfa: string;
  weight: number | null;
  sto: string;
  loadingPoint: string;
  vehicleIn: string;
  vehicleNumber: string;
  vehicleOut: string;
  slipNumber: string;
  status?: STOStatus;
  cancelled?: boolean;
  source?: 'manual' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface StatusRecord {
  id: string;
  demandDate: string;
  requiredDate: string;
  location: string;
  loadingPoint: string;
  weight: number | null;
  vehicleNumber: string;
  vehicleIn: string;
  vehicleOut: string;
  remark: string;
  status?: Page2Status;
  cancelled?: boolean;
  ignored?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RaipurRecord {
  id: string;
  date: string;
  location: string;
  plant: string;
  cfa: string;
  weight: number | null;
  stoNumbers: string[];
  loadingPoint: string;
  vehicleIn: string;
  vehicleNumber: string;
  vehicleOut: string;
  slipNumber: string;
  status: STOStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GateRecord {
  id: string;
  gateSlip: string;
  sto: string;
  vehicleNumber: string;
  gateInDate: string;
  gateOutDate: string;
  cfa: string;
  rawSheet: string;
  sourceRow: number;
}

export interface MappingRule {
  id: string;
  source: string;
  target: string;
  field: 'location' | 'loadingPoint' | 'cfa';
}

export interface AppState {
  planningRecords: PlanningRecord[];
  statusRecords: StatusRecord[];
  raipurRecords: RaipurRecord[];
  gateRecords: GateRecord[];
  mappings: MappingRule[];
  settings: { loadingPoints: string[] };
  version: number;
}

export interface Page1Group {
  key: string;
  date: string;
  cfa: string;
  loadingPoint: string;
  locations: string[];
  plants: string[];
  weights: number;
  records: PlanningRecord[];
  vehicleIn: string;
  vehicleOut: string;
  vehicleNumber: string;
  slips: string[];
  statuses: DerivedOperationalStatus[];
  status: Page1PlanStatus;
  multipleArrivalDates: { date: string; stoNumbers: string[] }[];
}

export interface Page2Group {
  key: string;
  demandDate: string;
  location: string;
  loadingPoint: string;
  records: StatusRecord[];
  status: Page2Status;
  page1Match: Page1Group | null;
  vehicleIn: string;
  vehicleOut: string;
  vehicleNumber: string;
  slipNumbers: string[];
}

export interface VehicleCallPendingRow {
  kind: 'planning';
  plan: Page1Group;
}

export interface PlanPendingRow {
  kind: 'status';
  status: Page2Group;
}

export interface PendingSTORow {
  sto: string;
  category: 'Vehicle dispatched, STO pending' | 'Core Pending';
  page1GroupKey: string;
}

export interface OnloadingVehicleRow {
  srNo: number;
  loadingPoint: string;
  cfaName: string;
  vehicleNo: string;
  vehicleInDate: string;
}

export interface VehiclePendingRow {
  sNo: number;
  demandedDate: string;
  requiredDate: string;
  loadingPoint: string;
  location: string;
  weight: number | null;
  pendingBy: string;
}

export interface ParseWarning {
  level: 'warning' | 'error';
  message: string;
  sheet?: string;
  row?: number;
}

export interface ParsedWorkbook {
  gateRecords: GateRecord[];
  warnings: ParseWarning[];
}
