import type { CaseRecord, ReviewRecord } from "../types";
import { daysUntil } from "../seed";

export type Scope = "all" | "review" | "mine" | "archived";

interface Props {
  cases: CaseRecord[];
  reviews: ReviewRecord[];
  scope: Scope;
  onScopeChange: (s: Scope) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
  currentUserRole: string;
  query: string;
  onQueryChange: (q: string) => void;
}

const SCOPE_LABELS: { key: Scope; label: string }[] = [
  { key: "all", label: "全部在办" },
  { key: "review", label: "待督导复核" },
  { key: "mine", label: "我负责的" },
  { key: "archived", label: "已归档" },
];

export default function CaseList({
  cases,
  reviews,
  scope,
  onScopeChange,
  selectedId,
  onSelect,
  currentUserId,
  currentUserRole,
  query,
  onQueryChange,
}: Props) {
  const reviewByCase = new Map(reviews.map((r) => [r.caseId, r]));

  const filtered = cases
    .filter((c) => {
      if (scope === "archived") return c.status === "archived";
      if (scope === "all") return c.status !== "archived";
      if (scope === "review") return c.status === "pending-review";
      if (scope === "mine")
        return c.status !== "archived" && c.counselorId === currentUserId;
      return true;
    })
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.trim();
      return (
        c.id.includes(q) ||
        c.clientCode.includes(q) ||
        c.session.summary.includes(q) ||
        c.session.nextPlan.includes(q)
      );
    })
    .sort((a, b) => a.archiveDue.localeCompare(b.archiveDue));

  return (
    <aside className="panel narrow case-list">
      <div className="scope-tabs">
        {SCOPE_LABELS.map((s) => (
          <button
            key={s.key}
            className={scope === s.key ? "active" : ""}
            onClick={() => onScopeChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <input
        className="search-input"
        placeholder="搜索编号 / 代号 / 摘要"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <p className="list-count">
        {currentUserRole === "督导"
          ? "督导视图：高风险与教学个案需逐条确认意见"
          : "共 " + filtered.length + " 个个案"}
      </p>
      <div className="case-items">
        {filtered.length === 0 && <p className="empty-hint">没有符合条件的个案</p>}
        {filtered.map((c) => {
          const review = reviewByCase.get(c.id);
          const openCount = review
            ? review.comments.filter((x) => x.status !== "resolved").length
            : 0;
          const days = daysUntil(c.archiveDue);
          return (
            <button
              key={c.id}
              className={"case-item" + (selectedId === c.id ? " selected" : "")}
              onClick={() => onSelect(c.id)}
            >
              <div className="case-item-top">
                <strong>{c.id}</strong>
                <span className={`risk-badge risk-${c.risk}`}>{c.risk}</span>
              </div>
              <div className="case-item-mid">
                {c.clientCode} · {c.topic}
                {c.teaching && <em className="teaching-tag">教学</em>}
              </div>
              <div className="case-item-bottom">
                {c.status === "pending-review" ? (
                  <span className="flag flag-review">
                    督导复核 · {openCount} 条意见待处理
                  </span>
                ) : c.status === "archived" ? (
                  <span className="flag flag-done">已归档 v{c.revision}</span>
                ) : (
                  <span className="flag flag-active">在办</span>
                )}
                {c.status !== "archived" && (
                  <span className={"flag " + (days < 0 ? "flag-overdue" : days <= 3 ? "flag-due" : "flag-time")}>
                    {days < 0 ? `逾期${-days}天` : `剩${days}天`}
                  </span>
                )}
              </div>
              {c.originalCounselorId && c.status !== "archived" && (
                <div className="transfer-hint">转组承接，含未结意见</div>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
