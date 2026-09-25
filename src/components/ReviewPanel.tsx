import { useState } from "react";
import type { CaseRecord, ReviewComment, ReviewRecord } from "../types";
import { personName } from "../seed";

interface Props {
  caseRecord: CaseRecord;
  review: ReviewRecord | undefined;
  currentUserId: string;
  isSupervisor: boolean;
  canActAsCounselor: boolean;
  onAddComment: (content: string) => void;
  onHandle: (commentId: string, note: string) => void;
  onConfirm: (commentId: string) => void;
  onReopen: (commentId: string) => void;
  onApprove: () => void;
}

const STATUS_TEXT: Record<ReviewComment["status"], { text: string; cls: string }> = {
  open: { text: "未处理", cls: "cs-open" },
  handled: { text: "已修改 · 待督导确认", cls: "cs-handled" },
  resolved: { text: "已确认处理", cls: "cs-resolved" },
};

function fmt(stamp: string): string {
  return stamp.replace("T", " ").slice(0, 16);
}

export default function ReviewPanel({
  caseRecord,
  review,
  currentUserId,
  isSupervisor,
  canActAsCounselor,
  onAddComment,
  onHandle,
  onConfirm,
  onReopen,
  onApprove,
}: Props) {
  const [text, setText] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const needsReview = caseRecord.risk === "高风险" || caseRecord.teaching;
  const comments = review?.comments ?? [];
  const open = comments.filter((c) => c.status === "open").length;
  const handled = comments.filter((c) => c.status === "handled").length;
  const resolved = comments.filter((c) => c.status === "resolved").length;
  const unresolvedCount = open + handled;

  return (
    <section className="panel review-panel">
      <div className="section-heading">
        <div>
          <p>督导复核</p>
          <h2>复核意见</h2>
        </div>
        <div className="review-rule">
          {needsReview ? (
            <span className="rule-badge rule-required">
              {caseRecord.risk === "高风险" ? "高风险个案" : "教学个案"} · 须复核通过才能归档
            </span>
          ) : (
            <span className="rule-badge rule-optional">中低风险 · 可直接归档</span>
          )}
        </div>
      </div>

      {review && (
        <div className="review-meta">
          <span>触发原因：{review.triggeredBy === "teaching" ? "教学个案" : review.triggeredBy}</span>
          <span>最近提交：{fmt(review.lastSubmissionAt)}</span>
          <span className="count-pill">未处理 {open}</span>
          <span className="count-pill handled">待确认 {handled}</span>
          <span className="count-pill resolved">已确认 {resolved}</span>
          {review.approvedAt && (
            <span className="count-pill resolved">复核通过 · {fmt(review.approvedAt)}</span>
          )}
        </div>
      )}

      <div className="comment-list">
        {comments.length === 0 && (
          <p className="empty-hint">
            {needsReview
              ? "个案已进入复核队列，督导可在此逐条登记意见。"
              : "该个案无需督导复核；如督导提出意见，将逐条跟踪到处理完成。"}
          </p>
        )}
        {comments.map((c) => {
          const st = STATUS_TEXT[c.status];
          return (
            <article key={c.id} className={`comment-card ${st.cls}`}>
              <header>
                <strong>{personName(c.authorId)}</strong>
                <span className="comment-time">
                  {fmt(c.createdAt)} · 针对 v{c.revisionAtCreation}
                </span>
                <span className={`comment-status ${st.cls}`}>{st.text}</span>
              </header>
              <p className="comment-content">{c.content}</p>

              {c.handledNote && (
                <div className="comment-reply">
                  <strong>{personName(c.handledBy)} 的修改说明：</strong>
                  {c.handledNote}
                  <span className="comment-time">{c.handledAt && fmt(c.handledAt)}</span>
                </div>
              )}
              {c.status === "resolved" && c.resolvedAt && (
                <div className="comment-reply confirmed">
                  {personName(c.resolvedBy)} 已确认 · {fmt(c.resolvedAt)}
                </div>
              )}

              <footer>
                {c.status === "open" && !isSupervisor && canActAsCounselor && (
                  <>
                    {replyFor === c.id ? (
                      <span className="reply-editor">
                        <input
                          placeholder="说明已如何修改（将另存新版本）"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <button
                          className="primary-action small"
                          onClick={() => {
                            if (replyText.trim()) {
                              onHandle(c.id, replyText.trim());
                              setReplyFor(null);
                              setReplyText("");
                            }
                          }}
                        >
                          提交修改说明
                        </button>
                        <button onClick={() => setReplyFor(null)}>取消</button>
                      </span>
                    ) : (
                      <button className="small" onClick={() => setReplyFor(c.id)}>
                        已按意见修改
                      </button>
                    )}
                  </>
                )}
                {c.status === "handled" && isSupervisor && (
                  <>
                    <button className="primary-action small" onClick={() => onConfirm(c.id)}>
                      确认已处理
                    </button>
                    <button
                      className="small"
                      onClick={() => onReopen(c.id)}
                      title="修改不到位，退回继续处理"
                    >
                      退回重做
                    </button>
                  </>
                )}
                {c.status === "resolved" && isSupervisor && caseRecord.status !== "archived" && (
                  <button className="small" onClick={() => onReopen(c.id)}>
                    重新打开
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      {isSupervisor &&
        caseRecord.status !== "archived" &&
        needsReview &&
        comments.length > 0 &&
        unresolvedCount === 0 &&
        !review?.approvedAt && (
          <div className="approve-row">
            <span className="op-hint ok">
              意见均已确认，但当前版本尚未复核（修订后需重新通过）。
            </span>
            <button className="primary-action" onClick={onApprove}>
              复核通过（允许归档）
            </button>
          </div>
        )}

      {isSupervisor && caseRecord.status !== "archived" && (
        <div className="comment-add">
          <textarea
            rows={2}
            placeholder="新增督导意见（保存后咨询师必须逐条处理，意见未确认前不能归档）"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="primary-action"
            disabled={!text.trim()}
            onClick={() => {
              onAddComment(text.trim());
              setText("");
            }}
          >
            登记意见
          </button>
        </div>
      )}
      {!isSupervisor && canActAsCounselor && needsReview && comments.length > 0 && (
        <p className="review-tip">
          处理流程：按意见修改登记 → 提交修改说明（自动另存新版本）→ 督导逐条确认 →
          复核通过后才能归档。
        </p>
      )}
    </section>
  );
}
