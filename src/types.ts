// 会谈复核台领域模型

export type RiskLevel = "高风险" | "中风险" | "低风险";
export type CaseStatus = "active" | "pending-review" | "archived";
export type ReviewStatus = "pending" | "addressed" | "none";
export type Topic = "焦虑" | "亲密关系" | "亲子" | "职业压力" | "抑郁" | "其他";

export interface SessionNote {
  /** ISO 日期，如 2026-09-24 */
  date: string;
  summary: string;
  emotion: string;
  intervention: string;
  nextPlan: string;
}

/** 个案 + 当前会谈登记（cases 库） */
export interface CaseRecord {
  id: string; // C-042
  clientCode: string; // 来访者代号
  topic: Topic;
  risk: RiskLevel;
  teaching: boolean; // 教学个案
  status: CaseStatus;
  counselorId: string; // 当前归属咨询师
  originalCounselorId?: string; // 转组前的原咨询师
  transferredAt?: string;
  transferredTo?: string;
  revision: number; // 当前登记版本号
  session: SessionNote;
  archiveDue: string; // 归档期限（ISO 日期）
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export type CommentStatus = "open" | "handled" | "resolved";

export interface ReviewComment {
  id: string;
  authorId: string; // 原提意见的督导（转组后仍可见）
  content: string;
  createdAt: string;
  status: CommentStatus;
  /** 咨询师称已按意见修改时填写，待督导确认 */
  handledNote?: string;
  handledBy?: string;
  handledAt?: string;
  /** 督导确认后该条意见才算处理完 */
  resolvedBy?: string;
  resolvedAt?: string;
  /** 意见针对的登记版本号 */
  revisionAtCreation: number;
}

/** 督导复核记录（reviews 库，一个个案一条，含多轮意见） */
export interface ReviewRecord {
  id: string; // review-<caseId>
  caseId: string;
  triggeredBy: RiskLevel | "teaching" | "manual";
  createdAt: string;
  /** 最近一次提交登记的时间；改过重提后复核继续 */
  lastSubmissionAt: string;
  comments: ReviewComment[];
  /** 所有意见确认后督导复核通过；内容再改或新增意见时失效 */
  approvedAt?: string;
  approvedBy?: string;
}

export type VersionStage = "revise" | "archived";

/** 内容版本（archiveVersions 库：修订另存 + 归档快照分开标记） */
export interface ContentVersion {
  id: string;
  caseId: string;
  /** 库内顺序版本号，修订与归档各自递增 */
  no: number;
  stage: VersionStage;
  /** 对应的个案登记版本号 */
  caseRevision: number;
  savedAt: string;
  savedBy: string;
  note: string;
  snapshot: SessionNote & {
    clientCode: string;
    topic: Topic;
    risk: RiskLevel;
    teaching: boolean;
  };
}

/** 本机未提交的编辑（localDrafts 库，与正式数据分开） */
export interface LocalDraft {
  id: string; // draft-new 或 draft-<caseId>
  caseId?: string;
  kind: "new" | "revise";
  payload: DraftPayload;
  updatedAt: string;
}

export interface DraftPayload {
  clientCode: string;
  topic: Topic;
  risk: RiskLevel;
  teaching: boolean;
  archiveDue: string;
  session: SessionNote;
}

export interface Person {
  id: string;
  name: string;
  role: "咨询师" | "督导" | "机构管理员";
}

export interface DataBundle {
  cases: CaseRecord[];
  reviews: ReviewRecord[];
  versions: ContentVersion[];
  drafts: LocalDraft[];
}
