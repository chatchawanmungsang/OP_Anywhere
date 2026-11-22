export type MonthOption = {
  yearThai: number;
  monthThai: number;
  label: string;
};

export type CrosstabRow = {
  code: string;
  name: string;
  affiliation: string;
  department: string | null;
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
  compensation: number;
};

export type DeptSubGroup = {
  department: string;
  rows: CrosstabRow[];
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
  compensation: number;
};

export type AffiliationGroup = {
  affiliation: string;
  rows: CrosstabRow[];
  departments: DeptSubGroup[];
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
  compensation: number;
};

export type CrosstabResult = {
  groups: AffiliationGroup[];
  totals: {
    p1TranCount: number;
    p1ChargeCost: number;
    p2TranCount: number;
    p2ChargeCost: number;
    monthTranCount: number;
    monthChargeCost: number;
    compensation: number;
    unitCount: number;
  };
};

export type ReportKind = "hcode" | "hmain" | "payment";

export type MonthPeriodStats = {
  yearThai: number;
  monthThai: number;
  label: string;
  p1Visits: number;
  p2Visits: number;
  monthVisits: number;
  p1Charge: number;
  p2Charge: number;
  monthCharge: number;
  unitCount: number;
  compensation: number;
};

export type MetricDelta = {
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
  direction: "up" | "down" | "flat" | "new";
};

export type DashboardPayload = {
  months: MonthOption[];
  selectedYear: number;
  selectedMonth: number;
  selectedLabel: string;
  previousLabel: string | null;
  current: MonthPeriodStats;
  previous: MonthPeriodStats | null;
  cards: {
    visits: MetricDelta;
    charge: MetricDelta;
    units: MetricDelta;
    compensation: MetricDelta;
  };
  periodCards: {
    p1Visits: MetricDelta;
    p2Visits: MetricDelta;
    p1Charge: MetricDelta;
    p2Charge: MetricDelta;
  };
  trend: MonthPeriodStats[];
};
