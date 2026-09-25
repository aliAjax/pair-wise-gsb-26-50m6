import { useState } from "react";
import type { DraftPayload, LocalDraft } from "../types";
import CaseForm, { emptyDraft, validateDraft } from "./CaseForm";

interface Props {
  draft: LocalDraft | undefined;
  currentUserId: string;
  onSaveDraft: (payload: DraftPayload) => void;
  onDiscardDraft: () => void;
  onSubmit: (payload: DraftPayload) => void;
  notify: (msg: string) => void;
}

export default function NewCase({
  draft,
  onSaveDraft,
  onDiscardDraft,
  onSubmit,
  notify,
}: Props) {
  const [form, setForm] = useState<DraftPayload>(draft?.payload ?? emptyDraft());
  const value = draft?.payload ?? form;

  function fmt(stamp: string): string {
    return stamp.replace("T", " ").slice(0, 16);
  }

  return (
    <div className="detail-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>新个案登记</p>
            <h2>会谈复核台 · 登记摘要 / 风险等级 / 下一步计划 / 归档期限</h2>
          </div>
          <div className="action-row">
            {draft && <button onClick={onDiscardDraft}>放弃本机草稿</button>}
            <button
              className="primary-action"
              onClick={() => {
                const errors = validateDraft(value);
                if (errors.length > 0) {
                  notify("还缺少必填项：" + errors.join("、"));
                  return;
                }
                onSubmit(value);
                setForm(emptyDraft());
              }}
            >
              提交登记
            </button>
          </div>
        </div>
        <CaseForm value={value} onChange={(p) => {
          setForm(p);
          onSaveDraft(p);
        }} />
        <p className="review-tip">
          输入自动存为本机草稿（与正式个案分开维护）；高风险或教学个案提交后自动进入督导复核。
          {draft && <> 本机草稿保存于 {fmt(draft.updatedAt)}。</>}
        </p>
      </section>
    </div>
  );
}
