import { useState } from "react";
import type { CaseRecord, ContentVersion } from "../types";
import { personName } from "../seed";

interface Props {
  caseRecord: CaseRecord;
  versions: ContentVersion[];
}

function fmt(stamp: string): string {
  return stamp.replace("T", " ").slice(0, 16);
}

export default function VersionsPanel({ caseRecord, versions }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const mine = versions
    .filter((v) => v.caseId === caseRecord.id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  return (
    <section className="panel versions-panel">
      <div className="section-heading">
        <div>
          <p>内容版本</p>
          <h2>修订与归档版本</h2>
        </div>
        <span className="version-count">共 {mine.length} 个版本 · 当前 v{caseRecord.revision}</span>
      </div>
      {mine.length === 0 && (
        <p className="empty-hint">还没有另存的版本。修改后提交或归档时会自动生成。</p>
      )}
      <div className="version-list">
        {mine.map((v) => {
          const expanded = openId === v.id;
          return (
            <article key={v.id} className={`version-card stage-${v.stage}`}>
              <button className="version-head" onClick={() => setOpenId(expanded ? null : v.id)}>
                <span className={`version-tag ${v.stage === "archived" ? "tag-archive" : "tag-revise"}`}>
                  {v.stage === "archived" ? "归档版本" : "修订另存"}
                </span>
                <strong>
                  {v.stage === "archived" ? "归档" : "修订"} #{v.no}
                </strong>
                <span className="version-meta">对应登记 v{v.caseRevision}</span>
                <span className="version-meta">{fmt(v.savedAt)}</span>
                <span className="version-meta">{personName(v.savedBy)}</span>
                <span className="expand">{expanded ? "收起" : "查看快照"}</span>
              </button>
              {v.note && <p className="version-note">{v.note}</p>}
              {expanded && (
                <div className="version-snapshot">
                  <div>
                    <span>来访者代号</span>
                    <b>{v.snapshot.clientCode}</b>
                  </div>
                  <div>
                    <span>会谈日期</span>
                    <b>{v.snapshot.date}</b>
                  </div>
                  <div>
                    <span>主题 / 风险</span>
                    <b>
                      {v.snapshot.topic} · {v.snapshot.risk}
                      {v.snapshot.teaching && " · 教学"}
                    </b>
                  </div>
                  <div className="snapshot-block">
                    <span>登记摘要</span>
                    <p>{v.snapshot.summary}</p>
                  </div>
                  <div className="snapshot-block">
                    <span>情绪状态</span>
                    <p>{v.snapshot.emotion}</p>
                  </div>
                  <div className="snapshot-block">
                    <span>干预方法</span>
                    <p>{v.snapshot.intervention}</p>
                  </div>
                  <div className="snapshot-block">
                    <span>下一步计划</span>
                    <p>{v.snapshot.nextPlan}</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
