import { useMemo, useState } from "react";
import "./styles.css";
import {
  buildSeed,
  countStore,
  dateOffset,
  daysUntil,
  defaultLocalState,
  formatTime,
  makeId,
  opinionDaysLeft,
  clearStore,
  usePersistentState,
  type StoreKey,
} from "./storage";
import {
  COUNSELORS,
  REVIEW_CATEGORIES,
  RISK_META,
  SUPERVISORS,
  type CaseVersion,
  type CounselorCase,
  type DraftForm,
  type ReviewCategory,
  type ReviewOpinion,
  type RiskLevel,
} from "./types";
import { EmptyHint, Modal, RemainingTag, RiskBadge } from "./ui";

type CaseStatus = "draft" | "review" | "ready" | "archived";
type StatusFilter = "all" | CaseStatus;
type TabKey = "register" | "review" | "versions" | "handover";

const STATUS_LABEL: Record<CaseStatus, string> = {
  draft: "待登记",
  review: "督导复核中",
  ready: "可归档",
  archived: "已归档",
};

const TOPICS = ["焦虑", "亲密关系", "亲子", "职业压力"];

const STORAGE_META: { key: StoreKey; name: string; desc: string }[] = [
  { key: "cases", name: "个案台账", desc: "登记摘要、风险与计划" },
  { key: "reviews", name: "复核记录", desc: "督导意见及逐条处理" },
  { key: "versions", name: "归档版本", desc: "每次修改另存的版本" },
  { key: "local", name: "本机保存", desc: "角色、选中项与草稿" },
];

function needsSupervision(c: CounselorCase): boolean {
  return c.risk === "high" || c.teaching;
}

function caseStatus(c: CounselorCase, opinions: ReviewOpinion[]): CaseStatus {
  if (c.archived) return "archived";
  if (c.currentVersion === 0) return "draft";
  const open = opinions.filter((o) => !o.resolved);
  if (open.length > 0) return "review";
  if (needsSupervision(c) && !c.reviewPassedAt) return "review";
  return "ready";
}

function draftForm(c: CounselorCase, draft: DraftForm | undefined) {
  const committed = {
    summary: c.summary,
    risk: c.risk,
    teaching: c.teaching,
    nextPlan: c.nextPlan,
    archiveDeadline: c.archiveDeadline,
  };
  if (draft && draft.savedAt > c.updatedAt) {
    return { ...committed, ...draft.data } as typeof committed;
  }
  return committed;
}

function App() {
  const seed = useMemo(() => buildSeed(), []);
  const [cases, setCases] = usePersistentState<CounselorCase[]>(
    "cases",
    seed.cases
  );
  const [opinions, setOpinions] = usePersistentState<ReviewOpinion[]>(
    "reviews",
    seed.reviews
  );
  const [versions, setVersions] = usePersistentState<CaseVersion[]>(
    "versions",
    seed.versions
  );
  const [local, setLocal] = usePersistentState("local", defaultLocalState());

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [showNewCase, setShowNewCase] = useState(false);
  const [storeTick, setStoreTick] = useState(0); // 触发存储计数刷新

  const isSupervisor = local.role === "supervisor";
  const actorName = isSupervisor
    ? local.currentSupervisor
    : local.currentCounselor;

  const sortedCases = useMemo(
    () =>
      [...cases].sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      }),
    [cases]
  );

  const selected =
    cases.find((c) => c.id === local.selectedCaseId) ??
    sortedCases.find((c) => !c.archived) ??
    sortedCases[0] ??
    null;

  const caseOpinions = useMemo(
    () =>
      opinions
        .filter((o) => o.caseId === selected?.id)
        .sort((a, b) => a.raisedAt - b.raisedAt),
    [opinions, selected?.id]
  );

  const caseVersions = useMemo(
    () =>
      versions
        .filter((v) => v.caseId === selected?.id)
        .sort((a, b) => b.version - a.version),
    [versions, selected?.id]
  );

  function selectCase(id: string) {
    setLocal((p) => ({ ...p, selectedCaseId: id, activeTab: "register" }));
  }

  function setTab(tab: TabKey) {
    setLocal((p) => ({ ...p, activeTab: tab }));
  }

  function patchDraft(
    caseId: string,
    patch: Partial<NonNullable<DraftForm["data"]>>
  ) {
    setLocal((p) => {
      const prev = p.drafts[caseId];
      const base = prev?.data ?? {};
      const next: DraftForm = {
        caseId,
        data: { ...base, ...patch },
        savedAt: Date.now(),
      };
      return { ...p, drafts: { ...p.drafts, [caseId]: next } };
    });
  }

  /** 登记提交 / 修改另存新版本 */
  function saveVersion(reason: string) {
    if (!selected) return;
    const c = selected;
    const form = draftForm(c, local.drafts[c.id]);
    if (!form.summary.trim() || !form.nextPlan.trim() || !form.archiveDeadline) {
      window.alert("摘要、下一步计划和归档期限为必填项，补齐后才能提交。");
      return;
    }
    const now = Date.now();
    const nextVersionNo = c.currentVersion + 1;
    const wasReview = needsSupervision(c);
    const isReview = form.risk === "high" || form.teaching;

    const version: CaseVersion = {
      id: makeId("ver"),
      caseId: c.id,
      version: nextVersionNo,
      reason:
        reason.trim() ||
        (nextVersionNo === 1 ? "首次登记" : "内容修改，另存新版本"),
      createdAt: now,
      createdBy: actorName,
      archived: false,
      snapshot: {
        summary: form.summary.trim(),
        risk: form.risk,
        teaching: form.teaching,
        nextPlan: form.nextPlan.trim(),
        archiveDeadline: form.archiveDeadline,
      },
    };

    setVersions((p) => [...p, version]);
    setCases((p) =>
      p.map((item) =>
        item.id === c.id
          ? {
              ...item,
              ...version.snapshot,
              currentVersion: nextVersionNo,
              registeredAt:
                item.currentVersion === 0 ? now : item.registeredAt,
              updatedAt: now,
              // 升级为高风险/教学个案后需重新进入督导复核
              reviewPassedAt:
                isReview && !wasReview ? null : item.reviewPassedAt ?? null,
            }
          : item
      )
    );
    setLocal((p) => {
      const drafts = { ...p.drafts };
      delete drafts[c.id];
      return { ...p, drafts };
    });
  }

  function archiveCase() {
    if (!selected) return;
    const blockers = archiveBlockers(selected, caseOpinions);
    if (blockers.length > 0) {
      window.alert(`暂不能归档：\n· ${blockers.join("\n· ")}`);
      return;
    }
    const now = Date.now();
    setCases((p) =>
      p.map((item) =>
        item.id === selected.id
          ? { ...item, archived: true, archivedAt: now }
          : item
      )
    );
    setVersions((p) =>
      p.map((v) =>
        v.caseId === selected.id && v.version === selected.currentVersion
          ? { ...v, archived: true, archivedAt: now }
          : v
      )
    );
  }

  function unarchiveCase() {
    if (!selected) return;
    setCases((p) =>
      p.map((item) =>
        item.id === selected.id
          ? { ...item, archived: false, archivedAt: undefined }
          : item
      )
    );
    setVersions((p) =>
      p.map((v) =>
        v.caseId === selected.id && v.archived
          ? { ...v, archived: false, archivedAt: undefined }
          : v
      )
    );
  }

  function addOpinion(
    category: ReviewCategory,
    content: string,
    deadlineDays: number
  ) {
    if (!selected || !content.trim()) return;
    const opinion: ReviewOpinion = {
      id: makeId("rev"),
      caseId: selected.id,
      supervisor: actorName,
      category,
      content: content.trim(),
      raisedAt: Date.now(),
      deadlineDays,
      resolved: false,
    };
    setOpinions((p) => [...p, opinion]);
    // 新意见进入复核队列，原复核通过状态失效
    setCases((p) =>
      p.map((item) =>
        item.id === selected.id
          ? { ...item, reviewPassedAt: null }
          : item
      )
    );
  }

  function resolveOpinion(opinionId: string, resolution: string) {
    if (!resolution.trim()) {
      window.alert("请填写处理说明，督导可据此复核。");
      return;
    }
    setOpinions((p) =>
      p.map((o) =>
        o.id === opinionId
          ? {
              ...o,
              resolved: true,
              resolvedAt: Date.now(),
              resolution: resolution.trim(),
              resolvedBy: actorName,
            }
          : o
      )
    );
  }

  function reopenOpinion(opinionId: string) {
    setOpinions((p) =>
      p.map((o) =>
        o.id === opinionId
          ? {
              ...o,
              resolved: false,
              resolvedAt: undefined,
              resolution: undefined,
              resolvedBy: undefined,
            }
          : o
      )
    );
    if (selected) {
      setCases((p) =>
        p.map((item) =>
          item.id === selected.id ? { ...item, reviewPassedAt: null } : item
        )
      );
    }
  }

  function passReview() {
    if (!selected) return;
    setCases((p) =>
      p.map((item) =>
        item.id === selected.id
          ? { ...item, reviewPassedAt: Date.now() }
          : item
      )
    );
  }

  /** 咨询师转组：未结意见随个案交接，意见提出人与时限不变 */
  function handover(toCounselor: string, note: string) {
    if (!selected || toCounselor === selected.ownerCounselor) return;
    const openCount = caseOpinions.filter((o) => !o.resolved).length;
    if (
      !window.confirm(
        `将 ${selected.code} 转交给 ${toCounselor}？${
          openCount > 0 ? `\n${openCount} 条未结督导意见将随案交接，时限继续计算。` : ""
        }`
      )
    )
      return;
    setCases((p) =>
      p.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              ownerCounselor: toCounselor,
              updatedAt: Date.now(),
              transferHistory: [
                ...item.transferHistory,
                {
                  fromCounselor: item.ownerCounselor,
                  toCounselor,
                  at: Date.now(),
                  note: note.trim(),
                },
              ],
            }
          : item
      )
    );
    setLocal((p) => ({ ...p, currentCounselor: toCounselor }));
  }

  function createCase(code: string, topic: string) {
    const c: CounselorCase = {
      id: makeId("case"),
      code,
      topic,
      ownerCounselor: local.currentCounselor,
      sessionDate: dateOffset(0),
      summary: "",
      risk: "attention",
      teaching: false,
      nextPlan: "",
      archiveDeadline: dateOffset(14),
      registeredAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      reviewPassedAt: null,
      currentVersion: 0,
      transferHistory: [],
    };
    setCases((p) => [...p, c]);
    setShowNewCase(false);
    setLocal((p) => ({ ...p, selectedCaseId: c.id, activeTab: "register" }));
    setStatusFilter("all");
    setTopicFilter("all");
  }

  function clearOneStore(key: StoreKey) {
    if (!window.confirm(`确定只清空「${STORAGE_META.find((m) => m.key === key)?.name}」？其他三类数据不受影响。`))
      return;
    clearStore(key);
    if (key === "cases") {
      setCases([]);
    } else if (key === "reviews") {
      setOpinions([]);
    } else if (key === "versions") {
      setVersions([]);
    } else {
      setLocal(defaultLocalState());
    }
    setStoreTick((n) => n + 1);
  }

  function resetDemo() {
    if (!window.confirm("重置为演示数据？将覆盖当前四类数据。")) return;
    setCases(seed.cases);
    setOpinions(seed.reviews);
    setVersions(seed.versions);
    setLocal({ ...defaultLocalState(), selectedCaseId: seed.cases[0].id });
    setStoreTick((n) => n + 1);
  }

  // 指标
  const activeCases = cases.filter((c) => !c.archived);
  const highCount = activeCases.filter((c) => c.risk === "high").length;
  const reviewCount = activeCases.filter(
    (c) => caseStatus(c, opinions.filter((o) => o.caseId === c.id)) === "review"
  ).length;
  const dueCount = activeCases.filter(
    (c) => daysUntil(c.archiveDeadline) <= 3
  ).length;

  const filtered = sortedCases.filter((c) => {
    if (topicFilter !== "all" && c.topic !== topicFilter) return false;
    if (statusFilter !== "all") {
      if (
        caseStatus(c, opinions.filter((o) => o.caseId === c.id)) !==
        statusFilter
      )
        return false;
    }
    return true;
  });

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-12 · 会谈复核台</p>
          <h1>心理咨询会谈复核台</h1>
          <p className="subtitle">
            登记会谈摘要、风险等级、下一步计划与归档期限；高风险或教学个案进入督导复核，
            意见逐条处理后方可归档，修改一律另存新版本。
          </p>
        </div>
        <div className="stack-card">
          <span>数据保存</span>
          <strong>本机浏览器 · 四类数据分开维护</strong>
          <p className="stack-note">
            重开页面可继续处理；个案、复核记录、归档版本、本机保存互不覆盖。
          </p>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="活跃个案" value={activeCases.length} tone="ok" />
        <MetricCard label="高风险关注" value={highCount} tone="danger" />
        <MetricCard label="督导复核中" value={reviewCount} tone="watch" />
        <MetricCard label="归档期限 ≤3 天" value={dueCount} tone="watch" />
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>当前身份</h2>
          <div className="role-switch">
            <button
              className={!isSupervisor ? "role-btn active" : "role-btn"}
              onClick={() => setLocal((p) => ({ ...p, role: "counselor" }))}
            >
              咨询师
            </button>
            <button
              className={isSupervisor ? "role-btn active" : "role-btn"}
              onClick={() => setLocal((p) => ({ ...p, role: "supervisor" }))}
            >
              督导
            </button>
          </div>
          <label className="select-label">
            <span>{isSupervisor ? "督导姓名" : "咨询师姓名"}</span>
            <select
              value={actorName}
              onChange={(e) =>
                setLocal((p) =>
                  isSupervisor
                    ? { ...p, currentSupervisor: e.target.value }
                    : { ...p, currentCounselor: e.target.value }
                )
              }
            >
              {(isSupervisor ? SUPERVISORS : COUNSELORS).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p className="aside-hint">
            {isSupervisor
              ? "可提督导意见、退回处理结果、确认复核通过。"
              : "登记个案、处理意见、发起转组与归档；只能编辑自己负责的个案。"}
          </p>

          <h2>主题筛选</h2>
          <div className="chips muted">
            <button
              className={topicFilter === "all" ? "chip-active" : ""}
              onClick={() => setTopicFilter("all")}
            >
              全部
            </button>
            {TOPICS.map((t) => (
              <button
                key={t}
                className={topicFilter === t ? "chip-active" : ""}
                onClick={() => setTopicFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <h2>本机数据</h2>
          <div className="store-list" data-tick={storeTick}>
            {STORAGE_META.map((m) => (
              <div key={m.key} className="store-row">
                <div>
                  <strong>{m.name}</strong>
                  <span>
                    {m.desc} · {countStore(m.key)} 条
                  </span>
                </div>
                <button
                  className="tiny-btn"
                  onClick={() => clearOneStore(m.key)}
                  title={`只清空${m.name}`}
                >
                  清空
                </button>
              </div>
            ))}
          </div>
          <button className="reset-demo" onClick={resetDemo}>
            重置为演示数据
          </button>
        </aside>

        <section className="panel list-panel">
          <div className="section-heading">
            <div>
              <p>个案台账</p>
              <h2>个案列表</h2>
            </div>
            <button
              className="primary-action"
              onClick={() => setShowNewCase(true)}
              disabled={isSupervisor}
              title={isSupervisor ? "督导不直接登记个案" : "登记新的会谈个案"}
            >
              新增登记
            </button>
          </div>

          <div className="status-filter">
            {(
              [
                ["all", "全部"],
                ["draft", "待登记"],
                ["review", "复核中"],
                ["ready", "可归档"],
                ["archived", "已归档"],
              ] as [StatusFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={statusFilter === key ? "status-btn active" : "status-btn"}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="case-list">
            {filtered.map((c) => {
              const ops = opinions.filter((o) => o.caseId === c.id);
              const status = caseStatus(c, ops);
              const open = ops.filter((o) => !o.resolved).length;
              const active = selected?.id === c.id;
              return (
                <article
                  key={c.id}
                  className={active ? "case-card active" : "case-card"}
                  onClick={() => selectCase(c.id)}
                >
                  <div className="case-card-top">
                    <h3>{c.code}</h3>
                    <span className={`status-pill status-${status}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="case-topic">
                    {c.topic} · 咨询师 {c.ownerCounselor}
                    {c.transferHistory.length > 0 && (
                      <span className="handover-flag" title="经转组交接">
                        {" "}
                        ↻ 转组交接
                      </span>
                    )}
                  </p>
                  <div className="case-card-bottom">
                    <RiskBadge risk={c.risk} teaching={c.teaching} />
                    <span className="case-meta">
                      {status === "review" && open > 0
                        ? `未结意见 ${open} 条 · `
                        : ""}
                      归档期限 {c.archiveDeadline}{" "}
                      <RemainingTag days={daysUntil(c.archiveDeadline)} />
                    </span>
                  </div>
                </article>
              );
            })}
            {filtered.length === 0 && (
              <EmptyHint>没有符合筛选条件的个案。</EmptyHint>
            )}
          </div>
        </section>
      </section>

      {selected && (
        <section className="panel detail-panel">
          <div className="detail-head">
            <div>
              <p>{selected.topic} · 会谈日期 {selected.sessionDate}</p>
              <h2>
                {selected.code}
                <span className="owner-tag">
                  负责人：{selected.ownerCounselor}
                </span>
              </h2>
            </div>
            <div className="detail-head-right">
              <RiskBadge risk={selected.risk} teaching={selected.teaching} />
              <span className={`status-pill status-${caseStatus(selected, caseOpinions)}`}>
                {STATUS_LABEL[caseStatus(selected, caseOpinions)]}
              </span>
            </div>
          </div>

          <TransferBanner
            c={selected}
            opinions={caseOpinions}
            viewerName={local.currentCounselor}
            isSupervisor={isSupervisor}
          />

          <nav className="tabs">
            <button
              className={local.activeTab === "register" ? "tab active" : "tab"}
              onClick={() => setTab("register")}
            >
              登记与归档
            </button>
            <button
              className={local.activeTab === "review" ? "tab active" : "tab"}
              onClick={() => setTab("review")}
            >
              督导复核（{caseOpinions.filter((o) => !o.resolved).length}/
              {caseOpinions.length} 未结）
            </button>
            <button
              className={local.activeTab === "versions" ? "tab active" : "tab"}
              onClick={() => setTab("versions")}
            >
              版本记录（v{selected.currentVersion}）
            </button>
            {!isSupervisor && (
              <button
                className={local.activeTab === "handover" ? "tab active" : "tab"}
                onClick={() => setTab("handover")}
              >
                转组交接
              </button>
            )}
          </nav>

          {local.activeTab === "register" && (
            <RegisterTab
              c={selected}
              draft={local.drafts[selected.id]}
              opinions={caseOpinions}
              readOnly={
                isSupervisor ||
                (local.currentCounselor !== selected.ownerCounselor &&
                  !selected.archived)
              }
              onPatch={(patch) => patchDraft(selected.id, patch)}
              onSave={(reason) => saveVersion(reason)}
              onArchive={archiveCase}
              onUnarchive={unarchiveCase}
            />
          )}

          {local.activeTab === "review" && (
            <ReviewTab
              c={selected}
              opinions={caseOpinions}
              isSupervisor={isSupervisor}
              isOwner={local.currentCounselor === selected.ownerCounselor}
              supervisorName={local.currentSupervisor}
              onAdd={addOpinion}
              onResolve={resolveOpinion}
              onReopen={reopenOpinion}
              onPass={passReview}
            />
          )}

          {local.activeTab === "versions" && (
            <VersionsTab versions={caseVersions} />
          )}

          {local.activeTab === "handover" && !isSupervisor && (
            <HandoverTab
              c={selected}
              opinions={caseOpinions}
              currentCounselor={local.currentCounselor}
              onHandover={handover}
            />
          )}
        </section>
      )}

      {showNewCase && (
        <NewCaseModal
          existingCodes={cases.map((c) => c.code)}
          owner={local.currentCounselor}
          onClose={() => setShowNewCase(false)}
          onCreate={createCase}
        />
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "watch" | "danger";
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={`status-${tone}`} />
    </article>
  );
}

function archiveBlockers(
  c: CounselorCase,
  ops: ReviewOpinion[]
): string[] {
  const blockers: string[] = [];
  if (c.currentVersion === 0) blockers.push("尚未完成首次登记提交。");
  const open = ops.filter((o) => !o.resolved);
  if (open.length > 0)
    blockers.push(`还有 ${open.length} 条督导意见未逐条处理。`);
  if (needsSupervision(c) && !c.reviewPassedAt)
    blockers.push("高风险/教学个案须经督导确认复核通过。");
  return blockers;
}

function TransferBanner({
  c,
  opinions,
  viewerName,
  isSupervisor,
}: {
  c: CounselorCase;
  opinions: ReviewOpinion[];
  viewerName: string;
  isSupervisor: boolean;
}) {
  const last = c.transferHistory[c.transferHistory.length - 1];
  if (!last) return null;
  const open = opinions.filter((o) => !o.resolved);
  const mine = !isSupervisor && last.toCounselor === viewerName;
  return (
    <div className={mine ? "transfer-banner mine" : "transfer-banner"}>
      <strong>转组交接：</strong>
      本案由 {last.fromCounselor} 于 {formatTime(last.at)} 转交给{" "}
      {last.toCounselor}
      {last.note ? `；交接说明：${last.note}` : "。"}
      {open.length > 0 && (
        <span>
          {" "}
          随案未结意见 {open.length} 条，仍由原督导提出，处理时限继续计算
          {mine ? "（请尽快处理）" : ""}。
        </span>
      )}
    </div>
  );
}

function RegisterTab({
  c,
  draft,
  opinions,
  readOnly,
  onPatch,
  onSave,
  onArchive,
  onUnarchive,
}: {
  c: CounselorCase;
  draft?: DraftForm;
  opinions: ReviewOpinion[];
  readOnly: boolean;
  onPatch: (patch: Partial<NonNullable<DraftForm["data"]>>) => void;
  onSave: (reason: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const [reason, setReason] = useState("");
  const form = draftForm(c, draft);
  const isDirty = !!draft && draft.savedAt > c.updatedAt;
  const blockers = archiveBlockers(c, opinions);
  const entersReview =
    (form.risk === "high" || form.teaching) &&
    !(c.risk === "high" || c.teaching);

  return (
    <div className="tab-body">
      {c.archived && (
        <div className="notice notice-archived">
          本案已于 {c.archivedAt ? formatTime(c.archivedAt) : ""} 归档，内容只读。
        </div>
      )}
      {readOnly && !c.archived && (
        <div className="notice">
          当前身份不是本案负责咨询师（{c.ownerCounselor}），登记内容仅可查看。
        </div>
      )}

      <div className="form-grid">
        <label className="full">
          <span>会谈摘要 *</span>
          <textarea
            rows={4}
            value={form.summary}
            disabled={readOnly || c.archived}
            placeholder="记录主要困扰、情绪状态、本次干预与来访者反应……"
            onChange={(e) => onPatch({ summary: e.target.value })}
          />
        </label>

        <label>
          <span>风险等级 *</span>
          <div className="risk-picker">
            {(Object.keys(RISK_META) as RiskLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                disabled={readOnly || c.archived}
                className={
                  form.risk === level
                    ? `risk-opt ${RISK_META[level].className} active`
                    : `risk-opt ${RISK_META[level].className}`
                }
                onClick={() => onPatch({ risk: level })}
              >
                {RISK_META[level].label}
              </button>
            ))}
          </div>
        </label>

        <label className="toggle-label">
          <span>教学个案</span>
          <input
            type="checkbox"
            checked={form.teaching}
            disabled={readOnly || c.archived}
            onChange={(e) => onPatch({ teaching: e.target.checked })}
          />
          <em>勾选后与高风险一样进入督导复核</em>
        </label>

        <label className="full">
          <span>下一步计划 *</span>
          <textarea
            rows={3}
            value={form.nextPlan}
            disabled={readOnly || c.archived}
            placeholder="家庭作业、下次会谈目标、安全计划跟进……"
            onChange={(e) => onPatch({ nextPlan: e.target.value })}
          />
        </label>

        <label>
          <span>归档期限 *</span>
          <input
            type="date"
            value={form.archiveDeadline}
            disabled={readOnly || c.archived}
            onChange={(e) => onPatch({ archiveDeadline: e.target.value })}
          />
        </label>
        <label>
          <span>距归档期限</span>
          <div className="deadline-box">
            <RemainingTag days={daysUntil(form.archiveDeadline)} />
          </div>
        </label>
      </div>

      {entersReview && (
        <div className="notice notice-warn">
          本次保存后个案将进入督导复核队列，需督导确认后方可归档。
        </div>
      )}

      {!readOnly && !c.archived && (
        <div className="save-bar">
          <input
            className="reason-input"
            value={reason}
            placeholder={
              c.currentVersion === 0
                ? "登记说明（可留空）"
                : "本次修改原因，将随新版本保存"
            }
            onChange={(e) => setReason(e.target.value)}
          />
          <span className="save-hint">
            {isDirty
              ? `草稿已本机保存 ${formatTime(draft!.savedAt)}，重开页面不丢失`
              : "修改会先存本机草稿"}
          </span>
          <button className="primary-action" onClick={() => { onSave(reason); setReason(""); }}>
            {c.currentVersion === 0
              ? "提交登记（生成 v1）"
              : `保存修改并另存 v${c.currentVersion + 1}`}
          </button>
        </div>
      )}

      <div className="archive-bar">
        {c.archived ? (
          !readOnly ? (
            <button onClick={onUnarchive}>撤回归档（恢复办理）</button>
          ) : null
        ) : (
          <>
            <button
              className="archive-btn"
              disabled={blockers.length > 0 || readOnly}
              onClick={onArchive}
            >
              归档
            </button>
            {blockers.length > 0 ? (
              <ul className="blockers">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <span className="ready-hint">意见已处理完毕，可以归档。</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReviewTab({
  c,
  opinions,
  isSupervisor,
  isOwner,
  supervisorName,
  onAdd,
  onResolve,
  onReopen,
  onPass,
}: {
  c: CounselorCase;
  opinions: ReviewOpinion[];
  isSupervisor: boolean;
  isOwner: boolean;
  supervisorName: string;
  onAdd: (
    category: ReviewCategory,
    content: string,
    deadlineDays: number
  ) => void;
  onResolve: (id: string, resolution: string) => void;
  onReopen: (id: string) => void;
  onPass: () => void;
}) {
  const [category, setCategory] = useState<ReviewCategory>("风险干预");
  const [content, setContent] = useState("");
  const [deadline, setDeadline] = useState(7);
  const open = opinions.filter((o) => !o.resolved);
  const allResolved = opinions.length > 0 && open.length === 0;
  const requireReview = needsSupervision(c);

  return (
    <div className="tab-body">
      <div className="review-flow">
        <span className={open.length === 0 ? "flow-step done" : "flow-step"}>
          ① 督导提出意见
        </span>
        <span className={open.length === 0 ? "flow-step done" : "flow-step"}>
          ② 咨询师逐条处理（{opinions.length - open.length}/{opinions.length}）
        </span>
        <span
          className={
            requireReview && c.reviewPassedAt ? "flow-step done" : "flow-step"
          }
        >
          ③ 督导确认复核{c.reviewPassedAt ? `（${formatTime(c.reviewPassedAt)}）` : ""}
        </span>
      </div>

      {!requireReview && c.currentVersion > 0 && (
        <div className="notice">
          该个案非高风险、非教学个案，无强制督导复核；如督导提出意见，仍须全部处理后才能归档。
        </div>
      )}

      <div className="opinion-list">
        {opinions.map((o) => (
          <OpinionCard
            key={o.id}
            opinion={o}
            isSupervisor={isSupervisor}
            canResolve={isOwner && !c.archived}
            onResolve={onResolve}
            onReopen={onReopen}
          />
        ))}
        {opinions.length === 0 && (
          <EmptyHint>
            暂无督导意见。{isSupervisor ? `以「${supervisorName}」身份提出第一条意见。` : "等待督导提出意见。"}
          </EmptyHint>
        )}
      </div>

      {isSupervisor && !c.archived && (
        <div className="add-opinion">
          <h4>提出督导意见</h4>
          <div className="add-opinion-row">
            <select value={category} onChange={(e) => setCategory(e.target.value as ReviewCategory)}>
              {REVIEW_CATEGORIES.map((cat) => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
            <select value={deadline} onChange={(e) => setDeadline(Number(e.target.value))}>
              {[3, 5, 7, 10].map((d) => (
                <option key={d} value={d}>
                  处理期限 {d} 天
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={3}
            value={content}
            placeholder="写下需要咨询师处理或教学复盘的具体意见……"
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="right">
            <button
              className="primary-action"
              onClick={() => {
                onAdd(category, content, deadline);
                setContent("");
              }}
              disabled={!content.trim()}
            >
              提出意见
            </button>
          </div>
        </div>
      )}

      {isSupervisor && requireReview && !c.archived && (
        <div className="pass-bar">
          <button
            className="primary-action"
            disabled={open.length > 0}
            onClick={onPass}
          >
            {c.reviewPassedAt ? "已确认复核通过" : "确认复核通过"}
          </button>
          <span className="save-hint">
            {open.length > 0
              ? `还有 ${open.length} 条意见未处理，不能确认通过。`
              : allResolved
                ? "意见已全部处理，可以确认；确认后咨询师可归档。"
                : "当前没有待处理意见，可直接确认通过。"}
          </span>
        </div>
      )}
    </div>
  );
}

function OpinionCard({
  opinion,
  isSupervisor,
  canResolve,
  onResolve,
  onReopen,
}: {
  opinion: ReviewOpinion;
  isSupervisor: boolean;
  canResolve: boolean;
  onResolve: (id: string, resolution: string) => void;
  onReopen: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const left = opinionDaysLeft(opinion);
  return (
    <article className={opinion.resolved ? "opinion-card resolved" : "opinion-card"}>
      <div className="opinion-head">
        <span className="opinion-cat">{opinion.category}</span>
        <span className="opinion-by">{opinion.supervisor} 提出</span>
        <span className="opinion-time">{formatTime(opinion.raisedAt)}</span>
        {opinion.resolved ? (
          <span className="resolved-tag">已处理</span>
        ) : (
          <RemainingTag days={left} />
        )}
      </div>
      <p className="opinion-content">{opinion.content}</p>
      {opinion.resolved ? (
        <div className="resolution-box">
          <strong>
            处理说明（{opinion.resolvedBy} ·{" "}
            {opinion.resolvedAt ? formatTime(opinion.resolvedAt) : ""}）：
          </strong>
          <p>{opinion.resolution}</p>
          {isSupervisor && (
            <button className="tiny-btn" onClick={() => onReopen(opinion.id)}>
              退回（重新处理）
            </button>
          )}
        </div>
      ) : (
        canResolve && (
          <div className="resolve-box">
            <textarea
              rows={2}
              value={text}
              placeholder="逐条回复：已采取的处理动作、修改了哪一版……"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="right">
              <button
                className="primary-action"
                onClick={() => {
                  onResolve(opinion.id, text);
                  setText("");
                }}
                disabled={!text.trim()}
              >
                提交处理
              </button>
            </div>
          </div>
        )
      )}
    </article>
  );
}

function VersionsTab({ versions }: { versions: CaseVersion[] }) {
  return (
    <div className="tab-body">
      <p className="save-hint">
        每次提交登记或修改都会另存新版本，归档时归档当前版本；历史版本不可覆盖。
      </p>
      <div className="version-list">
        {versions.map((v, idx) => {
          const prev = versions[idx + 1];
          const changedFields = prev
            ? (
                [
                  ["summary", "摘要"],
                  ["risk", "风险等级"],
                  ["teaching", "教学标记"],
                  ["nextPlan", "下一步计划"],
                  ["archiveDeadline", "归档期限"],
                ] as const
              ).filter(
                ([key]) =>
                  JSON.stringify(prev.snapshot[key]) !==
                  JSON.stringify(v.snapshot[key])
              )
            : [];
          return (
            <article key={v.id} className="version-card">
              <div className="version-head">
                <h4>
                  v{v.version}
                  {v.archived && <span className="archived-tag">已归档</span>}
                </h4>
                <span>
                  {v.createdBy} · {formatTime(v.createdAt)}
                </span>
              </div>
              <p className="version-reason">{v.reason}</p>
              {changedFields.length > 0 && (
                <div className="changed-fields">
                  本版改动：
                  {changedFields.map(([, label]) => (
                    <span key={label} className="changed-tag">
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <dl className="version-snapshot">
                <dt>摘要</dt>
                <dd>{v.snapshot.summary || "（空）"}</dd>
                <dt>风险等级</dt>
                <dd>
                  {RISK_META[v.snapshot.risk].label}
                  {v.snapshot.teaching ? " · 教学个案" : ""}
                </dd>
                <dt>下一步计划</dt>
                <dd>{v.snapshot.nextPlan || "（空）"}</dd>
                <dt>归档期限</dt>
                <dd>{v.snapshot.archiveDeadline}</dd>
              </dl>
            </article>
          );
        })}
        {versions.length === 0 && (
          <EmptyHint>尚未提交登记，暂无版本。</EmptyHint>
        )}
      </div>
    </div>
  );
}

function HandoverTab({
  c,
  opinions,
  currentCounselor,
  onHandover,
}: {
  c: CounselorCase;
  opinions: ReviewOpinion[];
  currentCounselor: string;
  onHandover: (to: string, note: string) => void;
}) {
  const [target, setTarget] = useState(
    COUNSELORS.find((n) => n !== c.ownerCounselor) ?? COUNSELORS[0]
  );
  const [note, setNote] = useState("");
  const open = opinions.filter((o) => !o.resolved);
  const isOwner = currentCounselor === c.ownerCounselor;

  return (
    <div className="tab-body">
      {!isOwner && (
        <div className="notice">
          你不是当前负责人（{c.ownerCounselor}），仅可查看交接记录。
        </div>
      )}
      {c.archived && <div className="notice notice-archived">个案已归档，不能再转组。</div>}

      <div className="handover-open">
        <h4>随案未结意见（{open.length} 条）</h4>
        {open.length > 0 ? (
          <div className="opinion-list">
            {open.map((o) => (
              <article key={o.id} className="opinion-card">
                <div className="opinion-head">
                  <span className="opinion-cat">{o.category}</span>
                  <span className="opinion-by">原意见：{o.supervisor}</span>
                  <RemainingTag days={opinionDaysLeft(o)} />
                </div>
                <p className="opinion-content">{o.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyHint>没有未结意见，可直接交接。</EmptyHint>
        )}

        {isOwner && !c.archived && (
          <div className="handover-form">
            <label className="select-label">
              <span>接手咨询师</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {COUNSELORS.filter((n) => n !== c.ownerCounselor).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="select-label">
              <span>交接说明</span>
              <textarea
                rows={2}
                value={note}
                placeholder="风险提示、进行中的安排、接手人需优先处理的意见……"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className="primary-action"
              onClick={() => {
                onHandover(target, note);
                setNote("");
              }}
            >
              确认转组并交接未结意见
            </button>
          </div>
        )}
      </div>

      <h4 className="history-title">交接历史</h4>
      {c.transferHistory.length === 0 ? (
        <EmptyHint>本案尚未发生转组。</EmptyHint>
      ) : (
        <ol className="transfer-history">
          {[...c.transferHistory].reverse().map((t, i) => (
            <li key={i}>
              <strong>{formatTime(t.at)}</strong>
              {t.fromCounselor} → {t.toCounselor}
              {t.note ? <span>；{t.note}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NewCaseModal({
  existingCodes,
  owner,
  onClose,
  onCreate,
}: {
  existingCodes: string[];
  owner: string;
  onClose: () => void;
  onCreate: (code: string, topic: string) => void;
}) {
  const nextNo =
    existingCodes.reduce((max, code) => {
      const n = Number(code.replace(/\D/g, ""));
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0) + 1;
  const [code, setCode] = useState(`C-${String(nextNo).padStart(3, "0")}`);
  const [topic, setTopic] = useState(TOPICS[0]);

  return (
    <Modal title="新增会谈登记" onClose={onClose}>
      <div className="modal-body">
        <label className="select-label">
          <span>来访者代号</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="select-label">
          <span>咨询主题</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <p className="save-hint">
          负责咨询师：{owner}。创建后进入登记页，提交登记时生成 v1。
        </p>
        <div className="right">
          <button
            className="primary-action"
            disabled={!code.trim()}
            onClick={() => onCreate(code.trim(), topic)}
          >
            创建并开始登记
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default App;
