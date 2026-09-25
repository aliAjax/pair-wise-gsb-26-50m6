export type Role = "counselor" | "supervisor";

export type RiskLevel = "stable" | "attention" | "high";

export type ReviewCategory = "风险干预" | "记录规范" | "伦理边界" | "教学讨论";

export interface TransferRecord {
  fromCounselor: string;
  toCounselor: string;
  at: number;
  note: string;
}

export interface CounselorCase {
  id: string;
  code: string;
  topic: string;
  ownerCounselor: string;
  sessionDate: string; // YYYY-MM-DD
  summary: string;
  risk: RiskLevel;
  teaching: boolean;
  nextPlan: string;
  archiveDeadline: string; // YYYY-MM-DD
  registeredAt: number;
  updatedAt: number;
  archived: boolean;
  archivedAt?: number;
  reviewPassedAt?: number | null;
  currentVersion: number;
  transferHistory: TransferRecord[];
}

export interface ReviewOpinion {
  id: string;
  caseId: string;
  supervisor: string;
  category: ReviewCategory;
  content: string;
  raisedAt: number;
  deadlineDays: number;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
  resolvedBy?: string;
}

export interface CaseVersion {
  id: string;
  caseId: string;
  version: number;
  reason: string;
  createdAt: number;
  createdBy: string;
  archived: boolean;
  archivedAt?: number;
  snapshot: {
    summary: string;
    risk: RiskLevel;
    teaching: boolean;
    nextPlan: string;
    archiveDeadline: string;
  };
}

export interface DraftForm {
  caseId: string;
  data: Partial<{
    summary: string;
    risk: RiskLevel;
    teaching: boolean;
    nextPlan: string;
    archiveDeadline: string;
  }>;
  savedAt: number;
}

export interface LocalState {
  role: Role;
  currentCounselor: string;
  currentSupervisor: string;
  selectedCaseId: string | null;
  activeTab: "register" | "review" | "versions" | "handover";
  drafts: Record<string, DraftForm>;
}

export const RISK_META: Record<
  RiskLevel,
  { label: string; className: string; needsReview: boolean }
> = {
  stable: { label: "稳定", className: "risk-stable", needsReview: false },
  attention: { label: "关注", className: "risk-attention", needsReview: false },
  high: { label: "高风险", className: "risk-high", needsReview: true },
};

export const REVIEW_CATEGORIES: ReviewCategory[] = [
  "风险干预",
  "记录规范",
  "伦理边界",
  "教学讨论",
];

export const COUNSELORS = ["李敏", "周航", "陈雨桐"];
export const SUPERVISORS = ["王督导", "赵督导"];
