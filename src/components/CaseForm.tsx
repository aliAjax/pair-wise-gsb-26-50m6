import type { DraftPayload, RiskLevel, Topic } from "../types";

export const TOPICS: Topic[] = ["焦虑", "亲密关系", "亲子", "职业压力", "抑郁", "其他"];
export const RISKS: RiskLevel[] = ["高风险", "中风险", "低风险"];

interface Props {
  value: DraftPayload;
  onChange: (next: DraftPayload) => void;
  disabled?: boolean;
}

export default function CaseForm({ value, onChange, disabled }: Props) {
  const patchSession = (patch: Partial<DraftPayload["session"]>) =>
    onChange({ ...value, session: { ...value.session, ...patch } });

  const field = (
    label: string,
    key: keyof DraftPayload["session"],
    area = false,
    placeholder = ""
  ) => (
    <label className={area ? "wide" : ""}>
      <span>{label}</span>
      {area ? (
        <textarea
          rows={3}
          disabled={disabled}
          value={value.session[key]}
          placeholder={placeholder}
          onChange={(e) => patchSession({ [key]: e.target.value } as never)}
        />
      ) : (
        <input
          disabled={disabled}
          value={value.session[key]}
          placeholder={placeholder}
          onChange={(e) => patchSession({ [key]: e.target.value } as never)}
        />
      )}
    </label>
  );

  return (
    <div className="field-grid">
      <label>
        <span>来访者代号</span>
        <input
          value={value.clientCode}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, clientCode: e.target.value })}
        />
      </label>
      <label>
        <span>会谈日期</span>
        <input
          type="date"
          value={value.session.date}
          disabled={disabled}
          onChange={(e) => patchSession({ date: e.target.value })}
        />
      </label>
      <label>
        <span>咨询主题</span>
        <select
          value={value.topic}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, topic: e.target.value as Topic })}
        >
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        <span>风险等级</span>
        <select
          value={value.risk}
          className={`risk-select risk-${value.risk}`}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, risk: e.target.value as RiskLevel })}
        >
          {RISKS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        <span>归档期限</span>
        <input
          type="date"
          value={value.archiveDue}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, archiveDue: e.target.value })}
        />
      </label>
      <label className="checkbox-label">
        <span>教学个案</span>
        <span className="checkbox-row">
          <input
            type="checkbox"
            checked={value.teaching}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, teaching: e.target.checked })}
          />
          勾选后自动进入督导复核
        </span>
      </label>

      {field("登记摘要", "summary", true, "本次会谈的主要内容与观察")}
      {field("情绪状态", "emotion", false, "如：焦虑、回避")}
      {field("干预方法", "intervention", true)}
      {field("下一步计划", "nextPlan", true)}
    </div>
  );
}

export function emptyDraft(): DraftPayload {
  return {
    clientCode: "",
    topic: "焦虑",
    risk: "低风险",
    teaching: false,
    archiveDue: "2026-10-09",
    session: {
      date: "2026-09-25",
      summary: "",
      emotion: "",
      intervention: "",
      nextPlan: "",
    },
  };
}

export function draftFromCase(c: {
  clientCode: string;
  topic: Topic;
  risk: RiskLevel;
  teaching: boolean;
  archiveDue: string;
  session: DraftPayload["session"];
}): DraftPayload {
  return {
    clientCode: c.clientCode,
    topic: c.topic,
    risk: c.risk,
    teaching: c.teaching,
    archiveDue: c.archiveDue,
    session: { ...c.session },
  };
}

/** 必填校验，返回错误信息数组 */
export function validateDraft(d: DraftPayload): string[] {
  const errors: string[] = [];
  if (!d.clientCode.trim()) errors.push("来访者代号");
  if (!d.session.date) errors.push("会谈日期");
  if (!d.session.summary.trim()) errors.push("登记摘要");
  if (!d.session.nextPlan.trim()) errors.push("下一步计划");
  if (!d.archiveDue) errors.push("归档期限");
  return errors;
}
