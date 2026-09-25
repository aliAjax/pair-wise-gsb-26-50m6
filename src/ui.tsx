import type { ReactNode } from "react";
import { RISK_META, type RiskLevel } from "./types";

export function RiskBadge({
  risk,
  teaching,
}: {
  risk: RiskLevel;
  teaching?: boolean;
}) {
  const meta = RISK_META[risk];
  return (
    <span className="badge-row">
      <span className={`risk-badge ${meta.className}`}>{meta.label}</span>
      {teaching && <span className="teaching-badge">教学个案</span>}
    </span>
  );
}

/** 剩余时间标签：负数=已逾期 */
export function RemainingTag({ days }: { days: number }) {
  const cls = days < 0 ? "tag-danger" : days <= 2 ? "tag-warn" : "tag-normal";
  const text =
    days < 0 ? `已逾期 ${Math.abs(days)} 天` : `剩 ${days} 天`;
  return <span className={`remaining-tag ${cls}`}>{text}</span>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}
