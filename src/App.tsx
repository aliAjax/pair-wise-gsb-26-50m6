import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type {
  CaseRecord,
  ContentVersion,
  DraftPayload,
  LocalDraft,
  ReviewRecord,
} from "./types";
import { deleteItem, loadBundle, putItem, resetAll } from "./db";
import { buildSeed, daysUntil, nowStamp, PEOPLE, personName } from "./seed";
import CaseList, { type Scope } from "./components/CaseList";
import CaseDetail from "./components/CaseDetail";
import NewCase from "./components/NewCase";

const project = {
  id: "hxwl-12",
  port: 5112,
  title: "心理咨询会谈复核台",
  subtitle: "会谈登记、风险分级、督导意见逐条复核与归档版本管理",
};

type View = { mode: "detail"; caseId: string } | { mode: "new" } | { mode: "none" };

function App() {
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);

  const [currentUserId, setCurrentUserId] = useState(PEOPLE[0].id);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ mode: "none" });
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "warn" } | null>(null);

  const currentUser = PEOPLE.find((p) => p.id === currentUserId)!;
  const isSupervisor = currentUser.role === "督导";
  const isAdmin = currentUser.role === "机构管理员";
  const isCounselor = currentUser.role === "咨询师";

  function notify(msg: string, kind: "ok" | "warn" = "ok") {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  }

  // 启动：四个对象库分开读取；首次进入写入示例数据
  useEffect(() => {
    (async () => {
      const bundle = await loadBundle();
      if (bundle.cases.length === 0) {
        const seed = buildSeed();
        await Promise.all(seed.cases.map((c) => putItem("cases", c)));
        await Promise.all(seed.reviews.map((r) => putItem("reviews", r)));
        await Promise.all(seed.versions.map((v) => putItem("archiveVersions", v)));
        setCases(seed.cases);
        setReviews(seed.reviews);
        setVersions(seed.versions);
        setDrafts([]);
      } else {
        setCases(bundle.cases);
        setReviews(bundle.reviews);
        setVersions(bundle.versions);
        setDrafts(bundle.drafts);
      }
      setReady(true);
    })();
  }, []);

  // 督导默认看待复核队列
  useEffect(() => {
    if (isSupervisor) setScope("review");
    else setScope("all");
  }, [currentUserId]);

  const saveCase = async (c: CaseRecord) => {
    setCases((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    await putItem("cases", c);
  };
  const saveReview = async (r: ReviewRecord) => {
    setReviews((prev) => {
      const exists = prev.some((x) => x.id === r.id);
      return exists ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r];
    });
    await putItem("reviews", r);
  };
  const saveVersion = async (v: ContentVersion) => {
    setVersions((prev) => [...prev, v]);
    await putItem("archiveVersions", v);
  };
  const saveDraft = async (d: LocalDraft) => {
    setDrafts((prev) => {
      const exists = prev.some((x) => x.id === d.id);
      return exists ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d];
    });
    await putItem("localDrafts", d);
  };
  const removeDraft = async (id: string) => {
    setDrafts((prev) => prev.filter((x) => x.id !== id));
    await deleteItem("localDrafts", id);
  };

  const selectedCase =
    view.mode === "detail" ? cases.find((c) => c.id === view.caseId) : undefined;
  const selectedReview = selectedCase
    ? reviews.find((r) => r.caseId === selectedCase.id)
    : undefined;

  // ---------- 本机草稿（localDrafts，与正式数据分开） ----------
  const newDraft = drafts.find((d) => d.id === "draft-new");
  const reviseDraft = selectedCase
    ? drafts.find((d) => d.id === `draft-${selectedCase.id}`)
    : undefined;

  const persistNewDraft = (payload: DraftPayload) =>
    saveDraft({ id: "draft-new", kind: "new", payload, updatedAt: nowStamp() });

  const persistReviseDraft = (payload: DraftPayload) => {
    if (!selectedCase) return;
    saveDraft({
      id: `draft-${selectedCase.id}`,
      caseId: selectedCase.id,
      kind: "revise",
      payload,
      updatedAt: nowStamp(),
    });
  };

  // ---------- 新登记 ----------
  function submitNew(payload: DraftPayload) {
    const maxId = cases.reduce((max, c) => {
      const n = Number(c.id.replace(/\D/g, ""));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const id = `C-${String(maxId + 1).padStart(3, "0")}`;
    const ts = nowStamp();
    const needs = payload.risk === "高风险" || payload.teaching;
    const c: CaseRecord = {
      id,
      clientCode: payload.clientCode.trim(),
      topic: payload.topic,
      risk: payload.risk,
      teaching: payload.teaching,
      status: needs ? "pending-review" : "active",
      counselorId: currentUserId,
      revision: 1,
      session: payload.session,
      archiveDue: payload.archiveDue,
      reviewStatus: needs ? "pending" : "none",
      createdAt: ts,
      updatedAt: ts,
    };
    setCases((prev) => [...prev, c]);
    putItem("cases", c);
    if (needs) {
      const r: ReviewRecord = {
        id: `review-${id}`,
        caseId: id,
        triggeredBy: payload.risk === "高风险" ? "高风险" : "teaching",
        createdAt: ts,
        lastSubmissionAt: ts,
        comments: [],
      };
      setReviews((prev) => [...prev, r]);
      putItem("reviews", r);
    }
    removeDraft("draft-new");
    setView({ mode: "detail", caseId: id });
    notify(needs ? `已登记 ${id}，自动进入督导复核` : `已登记 ${id}`);
  }

  // ---------- 修订提交：改过的内容另存新版本 ----------
  function submitRevision(c: CaseRecord, payload: DraftPayload, note: string) {
    const ts = nowStamp();
    const nextRevision = c.revision + 1;
    const needs = payload.risk === "高风险" || payload.teaching;
    const existing = reviews.find((r) => r.caseId === c.id);
    const stillOpen = existing?.comments.some((x) => x.status !== "resolved") ?? false;
    const updated: CaseRecord = {
      ...c,
      clientCode: payload.clientCode.trim(),
      topic: payload.topic,
      risk: payload.risk,
      teaching: payload.teaching,
      revision: nextRevision,
      session: payload.session,
      archiveDue: payload.archiveDue,
      status: needs || stillOpen ? "pending-review" : "active",
      reviewStatus: needs || stillOpen ? "pending" : "addressed",
      updatedAt: ts,
    };
    saveCase(updated);

    const no = versions.filter((v) => v.caseId === c.id && v.stage === "revise").length + 1;
    saveVersion({
      id: `rev-${c.id}-${no}`,
      caseId: c.id,
      no,
      stage: "revise",
      caseRevision: nextRevision,
      savedAt: ts,
      savedBy: currentUserId,
      note,
      snapshot: {
        clientCode: updated.clientCode,
        topic: updated.topic,
        risk: updated.risk,
        teaching: updated.teaching,
        ...updated.session,
      },
    });

    const existingReview = reviews.find((r) => r.caseId === c.id);
    if (existingReview) {
      // 内容再改，此前的复核通过失效，意见需重新确认
      saveReview({ ...existingReview, lastSubmissionAt: ts, approvedAt: undefined, approvedBy: undefined });
    } else if (needs) {
      saveReview({
        id: `review-${c.id}`,
        caseId: c.id,
        triggeredBy: payload.risk === "高风险" ? "高风险" : "teaching",
        createdAt: ts,
        lastSubmissionAt: ts,
        comments: [],
      });
    }
    removeDraft(`draft-${c.id}`);
    notify(`已提交修订并另存为 v${nextRevision}`);
  }

  // ---------- 归档 ----------
  function archiveCase(c: CaseRecord) {
    const ts = nowStamp();
    saveCase({ ...c, status: "archived", reviewStatus: "addressed", updatedAt: ts });
    const no = versions.filter((v) => v.caseId === c.id && v.stage === "archived").length + 1;
    saveVersion({
      id: `arc-${c.id}-${no}`,
      caseId: c.id,
      no,
      stage: "archived",
      caseRevision: c.revision,
      savedAt: ts,
      savedBy: currentUserId,
      note: "会谈记录归档",
      snapshot: {
        clientCode: c.clientCode,
        topic: c.topic,
        risk: c.risk,
        teaching: c.teaching,
        ...c.session,
      },
    });
    removeDraft(`draft-${c.id}`);
    notify(`${c.id} 已归档，生成归档快照`);
  }

  function reopenCase(c: CaseRecord) {
    const needs = c.risk === "高风险" || c.teaching;
    saveCase({
      ...c,
      status: needs ? "pending-review" : "active",
      updatedAt: nowStamp(),
    });
    notify(`${c.id} 已重新打开`);
  }

  // ---------- 转组：未结意见随案交接 ----------
  function transferCase(c: CaseRecord, targetId: string) {
    const ts = nowStamp();
    saveCase({
      ...c,
      originalCounselorId: c.originalCounselorId ?? c.counselorId,
      counselorId: targetId,
      transferredAt: ts,
      transferredTo: targetId,
      updatedAt: ts,
    });
    // 未提交的本机修改不随人交接
    removeDraft(`draft-${c.id}`);
    notify(`已转组给 ${personName(targetId)}，未结意见随案交接`);
  }

  // ---------- 督导意见 ----------
  function addComment(c: CaseRecord, content: string) {
    const ts = nowStamp();
    const existing = reviews.find((r) => r.caseId === c.id);
    const comment = {
      id: `rv-${Date.now()}`,
      authorId: currentUserId,
      content,
      createdAt: ts,
      status: "open" as const,
      revisionAtCreation: c.revision,
    };
    if (existing) {
      saveReview({
        ...existing,
        comments: [...existing.comments, comment],
        approvedAt: undefined,
        approvedBy: undefined,
      });
    } else {
      saveReview({
        id: `review-${c.id}`,
        caseId: c.id,
        triggeredBy: "manual",
        createdAt: ts,
        lastSubmissionAt: c.updatedAt,
        comments: [comment],
      });
    }
    if (c.status !== "pending-review") {
      saveCase({ ...c, status: "pending-review", reviewStatus: "pending", updatedAt: ts });
    }
    notify("意见已登记，处理完前该个案不能归档");
  }

  function markHandled(c: CaseRecord, commentId: string, note: string) {
    const review = reviews.find((r) => r.caseId === c.id);
    if (!review) return;
    const target = review.comments.find((x) => x.id === commentId);
    if (!target) return;
    if (c.revision <= target.revisionAtCreation) {
      notify("请先在上方修改登记并提交修订（另存新版本），再标记意见已处理", "warn");
      return;
    }
    const ts = nowStamp();
    saveReview({
      ...review,
      comments: review.comments.map((x) =>
        x.id === commentId
          ? { ...x, status: "handled", handledNote: note, handledBy: currentUserId, handledAt: ts }
          : x
      ),
    });
    notify("已提交修改说明，等待督导确认");
  }

  function confirmComment(c: CaseRecord, commentId: string) {
    const review = reviews.find((r) => r.caseId === c.id);
    if (!review) return;
    const ts = nowStamp();
    const comments = review.comments.map((x) =>
      x.id === commentId
        ? { ...x, status: "resolved" as const, resolvedBy: currentUserId, resolvedAt: ts }
        : x
    );
    const allResolved = comments.every((x) => x.status === "resolved");
    saveReview({
      ...review,
      comments,
      approvedAt: allResolved ? ts : review.approvedAt,
      approvedBy: allResolved ? currentUserId : review.approvedBy,
    });
    if (allResolved) {
      saveCase({ ...c, status: "active", reviewStatus: "addressed", updatedAt: ts });
      notify("全部意见已确认，督导复核通过，可以归档");
    } else {
      notify("该条意见已确认");
    }
  }

  function reopenComment(c: CaseRecord, commentId: string) {
    const review = reviews.find((r) => r.caseId === c.id);
    if (!review) return;
    const ts = nowStamp();
    saveReview({
      ...review,
      approvedAt: undefined,
      approvedBy: undefined,
      comments: review.comments.map((x) =>
        x.id === commentId
          ? {
              ...x,
              status: "open",
              handledNote: undefined,
              handledBy: undefined,
              handledAt: undefined,
              resolvedBy: undefined,
              resolvedAt: undefined,
            }
          : x
      ),
    });
    saveCase({ ...c, status: "pending-review", reviewStatus: "pending", updatedAt: ts });
    notify("意见已退回，继续处理前不能归档", "warn");
  }

  function approveReview(c: CaseRecord) {
    const review = reviews.find((r) => r.caseId === c.id);
    if (!review) return;
    if (review.comments.length === 0 || review.comments.some((x) => x.status !== "resolved")) {
      notify("还有意见未确认，不能复核通过", "warn");
      return;
    }
    const ts = nowStamp();
    saveReview({ ...review, approvedAt: ts, approvedBy: currentUserId });
    saveCase({ ...c, status: "active", reviewStatus: "addressed", updatedAt: ts });
    notify("督导复核通过，可以归档");
  }

  // ---------- 指标 ----------
  const metrics = useMemo(() => {
    const active = cases.filter((c) => c.status !== "archived");
    const high = active.filter((c) => c.risk === "高风险").length;
    const pending = cases.filter((c) => c.status === "pending-review").length;
    const due = active.filter((c) => daysUntil(c.archiveDue) <= 3).length;
    const openComments = reviews.reduce(
      (n, r) => n + r.comments.filter((x) => x.status !== "resolved").length,
      0
    );
    return [
      { label: "在办个案", value: active.length, sub: "已归档 " + (cases.length - active.length) },
      { label: "高风险关注", value: high, sub: "须督导复核通过" },
      { label: "待复核 / 未结意见", value: `${pending} / ${openComments}`, sub: "意见逐条确认" },
      { label: "3天内到期或逾期", value: due, sub: "业务日期 2026-09-25" },
    ];
  }, [cases, reviews]);

  if (!ready) {
    return <main className="app-shell"><p className="loading">正在打开本机会谈复核台…</p></main>;
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">
            {project.id} · port {project.port} · 数据保存在本机 IndexedDB
          </p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
          <p className="subtitle small">
            督导会意见逐条落实：高风险与教学个案强制复核，意见未确认不能归档；修订另存新版本，转组未结意见随案交接。
          </p>
        </div>
        <div className="stack-card">
          <span>当前身份（演示切换）</span>
          <div className="identity-grid">
            {PEOPLE.map((p) => (
              <button
                key={p.id}
                className={"identity" + (p.id === currentUserId ? " active" : "")}
                onClick={() => setCurrentUserId(p.id)}
              >
                <b>{p.name}</b>
                <i>{p.role}</i>
              </button>
            ))}
          </div>
          <button
            className="reset-btn"
            onClick={async () => {
              if (window.confirm("清空本机数据并恢复示例数据？")) {
                await resetAll();
                const seed = buildSeed();
                await Promise.all(seed.cases.map((c) => putItem("cases", c)));
                await Promise.all(seed.reviews.map((r) => putItem("reviews", r)));
                await Promise.all(seed.versions.map((v) => putItem("archiveVersions", v)));
                setCases(seed.cases);
                setReviews(seed.reviews);
                setVersions(seed.versions);
                setDrafts([]);
                setView({ mode: "detail", caseId: seed.cases[0].id });
                notify("已恢复示例数据");
              }
            }}
          >
            恢复示例数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m, i) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <em className="metric-sub">{m.sub}</em>
            <i className={["status-ok", "status-danger", "status-watch", "status-danger"][i]} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <CaseList
          cases={cases}
          reviews={reviews}
          scope={scope}
          onScopeChange={setScope}
          selectedId={view.mode === "detail" ? view.caseId : null}
          onSelect={(id) => setView({ mode: "detail", caseId: id })}
          currentUserId={currentUserId}
          currentUserRole={currentUser.role}
          query={query}
          onQueryChange={setQuery}
        />

        <section className="detail-column">
          <div className="toolbar panel">
            <div className="toolbar-info">
              <b>{currentUser.name}</b>
              <span>
                {currentUser.role}
                {isCounselor && " · 可登记、修订、处理意见、归档自己的个案"}
                {isSupervisor && " · 可登记/确认意见、退回重做"}
                {isAdmin && " · 可办理转组、重新打开已归档个案"}
              </span>
            </div>
            {isCounselor && (
              <button
                className={"primary-action" + (view.mode === "new" ? " active-toggle" : "")}
                onClick={() => setView({ mode: "new" })}
              >
                新会谈登记
              </button>
            )}
          </div>

          {view.mode === "new" ? (
            <NewCase
              draft={newDraft}
              currentUserId={currentUserId}
              onSaveDraft={persistNewDraft}
              onDiscardDraft={() => removeDraft("draft-new")}
              onSubmit={submitNew}
              notify={notify}
            />
          ) : selectedCase ? (
            <CaseDetail
              key={selectedCase.id + (reviseDraft ? "-edit" : "")}
              caseRecord={selectedCase}
              review={selectedReview}
              versions={versions}
              draft={reviseDraft}
              currentUserId={currentUserId}
              isSupervisor={isSupervisor}
              isAdmin={isAdmin}
              onSaveDraft={persistReviseDraft}
              onDiscardDraft={() => removeDraft(`draft-${selectedCase.id}`)}
              onSubmit={(payload, note) => submitRevision(selectedCase, payload, note)}
              onStartRevise={() =>
                persistReviseDraft({
                  clientCode: selectedCase.clientCode,
                  topic: selectedCase.topic,
                  risk: selectedCase.risk,
                  teaching: selectedCase.teaching,
                  archiveDue: selectedCase.archiveDue,
                  session: { ...selectedCase.session },
                })
              }
              onArchive={() => archiveCase(selectedCase)}
              onReopenCase={() => reopenCase(selectedCase)}
              onTransfer={(id) => transferCase(selectedCase, id)}
              onAddComment={(content) => addComment(selectedCase, content)}
              onHandleComment={(cid, note) => markHandled(selectedCase, cid, note)}
              onConfirmComment={(cid) => confirmComment(selectedCase, cid)}
              onReopenComment={(cid) => reopenComment(selectedCase, cid)}
              onApprove={() => approveReview(selectedCase)}
              notify={notify}
            />
          ) : (
            <section className="panel empty-detail">
              <h2>从左侧选择一个个案</h2>
              <p>或点击右上角「新会谈登记」开始登记。重开页面后，未提交的本机草稿仍在。</p>
            </section>
          )}
        </section>
      </section>

      {toast && <div className={"toast " + toast.kind}>{toast.msg}</div>}
    </main>
  );
}

export default App;
