import { useState } from "react";
import type {
  CaseRecord,
  ContentVersion,
  DraftPayload,
  LocalDraft,
  ReviewRecord,
} from "../types";
import { COUNSELORS, daysUntil, personName } from "../seed";
import CaseForm, { draftFromCase, validateDraft } from "./CaseForm";
import ReviewPanel from "./ReviewPanel";
import VersionsPanel from "./VersionsPanel";

interface Props {
  caseRecord: CaseRecord;
  review: ReviewRecord | undefined;
  versions: ContentVersion[];
  draft: LocalDraft | undefined;
  currentUserId: string;
  isSupervisor: boolean;
  isAdmin: boolean;
  onSaveDraft: (payload: DraftPayload) => void;
  onDiscardDraft: () => void;
  onSubmit: (payload: DraftPayload, note: string) => void;
  onStartRevise: () => void;
  onArchive: () => void;
  onReopenCase: () => void;
  onTransfer: (toCounselorId: string) => void;
  onAddComment: (content: string) => void;
  onHandleComment: (commentId: string, note: string) => void;
  onConfirmComment: (commentId: string) => void;
  onReopenComment: (commentId: string) => void;
  onApprove: () => void;
  notify: (msg: string, kind?: "ok" | "warn") => void;
}

function fmt(stamp: string): string {
  return stamp.replace("T", " ").slice(0, 16);
}

export default function CaseDetail(props: Props) {
  const {
    caseRecord: c,
    review,
    versions,
    draft,
    currentUserId,
    isSupervisor,
    isAdmin,
  } = props;

  const editing = Boolean(draft);
  // 非编辑态只用于展示；进入编辑（点“修改登记”）后组件以 key 重挂载，从草稿初始化
  const [form, setForm] = useState<DraftPayload>(() =>
    draft ? draft.payload : draftFromCase(c)
  );
  const [submitNote, setSubmitNote] = useState("");

  const formState = draft ? draft.payload : form;

  const days = daysUntil(c.archiveDue);
  const unresolved = review?.comments.filter((x) => x.status !== "resolved") ?? [];
  const needsSupervision = c.risk === "高风险" || c.teaching;
  const approved = Boolean(review?.approvedAt) && unresolved.length === 0;

  const canArchive =
    c.status !== "archived" &&
    !editing &&
    unresolved.length === 0 &&
    (!needsSupervision || approved);

  const ownedByMe = c.counselorId === currentUserId;
  const canEdit = c.status !== "archived" && !isSupervisor && (ownedByMe || isAdmin);

  function persist(next: DraftPayload) {
    setForm(next);
    props.onSaveDraft(next);
  }

  function doSubmit() {
    const errors = validateDraft(formState);
    if (errors.length > 0) {
      props.notify("还缺少必填项：" + errors.join("、"), "warn");
      return;
    }
    props.onSubmit(formState, submitNote.trim() || "按督导意见修订登记内容");
    setSubmitNote("");
  }

  return (
    <div className="detail-stack">
      <section className="panel detail-head">
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">
              {c.id} · 当前 v{c.revision}
              {c.teaching && <span className="head-tag">教学个案</span>}
            </p>
            <h2>{c.clientCode}</h2>
          </div>
          <div className="detail-badges">
            <span className={`risk-badge risk-${c.risk}`}>{c.risk}</span>
            <span className={`status-pill status-${c.status}`}>
              {c.status === "archived"
                ? "已归档"
                : c.status === "pending-review"
                  ? "督导复核中"
                  : "在办"}
            </span>
            {c.status !== "archived" && (
              <span className={"due-chip " + (days < 0 ? "overdue" : days <= 3 ? "soon" : "")}>
                归档期限 {c.archiveDue} ·{" "}
                {days < 0 ? `已逾期 ${-days} 天` : `剩余 ${days} 天`}
              </span>
            )}
          </div>
        </div>

        <dl className="detail-meta">
          <div>
            <dt>咨询主题</dt>
            <dd>{c.topic}</dd>
          </div>
          <div>
            <dt>负责咨询师</dt>
            <dd>{personName(c.counselorId)}</dd>
          </div>
          <div>
            <dt>最近更新</dt>
            <dd>{fmt(c.updatedAt)}</dd>
          </div>
          <div>
            <dt>归档期限</dt>
            <dd>{c.archiveDue}</dd>
          </div>
        </dl>

        {c.originalCounselorId && (
          <div className="transfer-banner">
            <strong>转组交接</strong>
            <span>
              原咨询师 {personName(c.originalCounselorId)} 于 {fmt(c.transferredAt!)} 转出，
              接手人 {personName(c.counselorId)}。
            </span>
            {unresolved.length > 0 && (
              <span className="banner-warn">
                {unresolved.length} 条未结意见随案交接，原意见与提出人保留可查；归档期限不变，
                {days < 0 ? `已逾期 ${-days} 天` : `剩余 ${days} 天`}。
              </span>
            )}
          </div>
        )}

        {editing && (
          <div className="draft-banner">
            <strong>本机草稿</strong>
            <span>
              {draft?.kind === "new" ? "新登记" : "修订"}尚未提交，仅保存在本机浏览器；
              最近保存 {fmt(draft!.updatedAt)}，重开页面可继续。
            </span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>会谈登记</p>
            <h2>摘要 · 风险 · 下一步计划</h2>
          </div>
          <div className="action-row">
            {!editing && canEdit && (
              <button onClick={props.onStartRevise}>修改登记</button>
            )}
            {editing && (
              <>
                <button onClick={props.onDiscardDraft}>放弃草稿</button>
                <button className="primary-action" onClick={doSubmit}>
                  {draft?.kind === "new"
                    ? "提交登记"
                    : `提交修订（另存 v${c.revision + 1}）`}
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <>
            <CaseForm value={formState} onChange={persist} />
            <label className="revision-note">
              <span>修订说明（将记入版本）</span>
              <input
                placeholder="例如：按督导意见补入自杀风险评估问答"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
              />
            </label>
            <p className="review-tip">
              输入会自动存为本机草稿；提交后内容另存为新版本，原版本保留。
              {c.risk === "高风险" && "高风险个案提交后仍需督导复核通过。"}
            </p>
          </>
        ) : (
          <div className="readonly-form">
            <div>
              <span>会谈日期</span>
              <b>{c.session.date}</b>
            </div>
            <div>
              <span>情绪状态</span>
              <b>{c.session.emotion || "—"}</b>
            </div>
            <div className="block-wide">
              <span>登记摘要</span>
              <p>{c.session.summary}</p>
            </div>
            <div className="block-wide">
              <span>干预方法</span>
              <p>{c.session.intervention || "—"}</p>
            </div>
            <div className="block-wide">
              <span>下一步计划</span>
              <p>{c.session.nextPlan}</p>
            </div>
          </div>
        )}
      </section>

      <ReviewPanel
        caseRecord={c}
        review={review}
        currentUserId={currentUserId}
        isSupervisor={isSupervisor}
        canActAsCounselor={canEdit}
        onAddComment={props.onAddComment}
        onHandle={props.onHandleComment}
        onConfirm={props.onConfirmComment}
        onReopen={props.onReopenComment}
        onApprove={props.onApprove}
      />

      <section className="panel ops-panel">
        <div className="section-heading">
          <div>
            <p>流转操作</p>
            <h2>归档与转组</h2>
          </div>
        </div>

        <div className="ops-grid">
          <div className="op-card">
            <h3>归档</h3>
            {c.status === "archived" ? (
              <>
                <p>该个案已归档，内容只读。</p>
                {(isAdmin || isSupervisor) && (
                  <button onClick={props.onReopenCase}>重新打开（继续修订）</button>
                )}
              </>
            ) : editing ? (
              <p className="op-hint warn">草稿尚未提交，提交后才能归档。</p>
            ) : unresolved.length > 0 ? (
              <p className="op-hint warn">
                还有 {unresolved.length} 条督导意见未逐条确认处理，不能归档。
              </p>
            ) : needsSupervision && !approved ? (
              <p className="op-hint warn">高风险/教学个案需督导复核通过后才能归档。</p>
            ) : (
              <>
                <p className="op-hint ok">
                  {needsSupervision
                    ? "督导已复核通过，意见全部确认。"
                    : "无需复核或意见已处理完。"}
                </p>
                {(ownedByMe || isAdmin) && (
                  <button className="primary-action" onClick={props.onArchive}>
                    确认归档（生成归档快照）
                  </button>
                )}
              </>
            )}
          </div>

          <div className="op-card">
            <h3>咨询师转组</h3>
            {c.status === "archived" ? (
              <p className="op-hint">已归档个案不再转组。</p>
            ) : (
              <TransferBox
                currentId={c.counselorId}
                disabled={!canEdit && !isAdmin}
                onTransfer={props.onTransfer}
                notify={props.notify}
                hasOpen={unresolved.length > 0}
              />
            )}
            {c.status !== "archived" && (
              <p className="op-hint">
                转组后未结意见随案交接，接手人可看到原督导意见、提出人及剩余归档时间。
              </p>
            )}
          </div>
        </div>
      </section>

      <VersionsPanel caseRecord={c} versions={versions} />
    </div>
  );
}

function TransferBox({
  currentId,
  disabled,
  onTransfer,
  notify,
  hasOpen,
}: {
  currentId: string;
  disabled: boolean;
  onTransfer: (id: string) => void;
  notify: (msg: string, kind?: "ok" | "warn") => void;
  hasOpen: boolean;
}) {
  const [target, setTarget] = useState("");
  return (
    <>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">选择接手咨询师…</option>
        {COUNSELORS.filter((p) => p.id !== currentId).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        disabled={disabled || !target}
        onClick={() => {
          onTransfer(target);
          notify(
            hasOpen
              ? "已转组，未结意见与剩余时间随案交接"
              : "已转组给" + personName(target)
          );
          setTarget("");
        }}
      >
        办理转组交接
      </button>
      {disabled && <p className="op-hint">仅负责咨询师或管理员可办理转组。</p>}
    </>
  );
}
