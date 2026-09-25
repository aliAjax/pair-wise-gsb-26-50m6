import type { ContentVersion, CaseRecord, DataBundle, Person, ReviewRecord } from "./types";

/** 人员目录（演示用，前端内置） */
export const PEOPLE: Person[] = [
  { id: "counselor-lin", name: "林顾问", role: "咨询师" },
  { id: "counselor-zhao", name: "赵顾问", role: "咨询师" },
  { id: "counselor-shen", name: "沈顾问", role: "咨询师" },
  { id: "supervisor-qin", name: "秦督导", role: "督导" },
  { id: "supervisor-he", name: "何督导", role: "督导" },
  { id: "admin", name: "机构管理员", role: "机构管理员" },
];

export function personName(id?: string): string {
  if (!id) return "—";
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
}

export const COUNSELORS = PEOPLE.filter((p) => p.role === "咨询师");

const TODAY = "2026-09-25";

function iso(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/** 示例数据：含高风险待复核、教学个案、转组个案、已归档各一种 */
export function buildSeed(): DataBundle {
  const cases: CaseRecord[] = [
    {
      id: "C-203",
      clientCode: "来访者A",
      topic: "职业压力",
      risk: "高风险",
      teaching: false,
      status: "pending-review",
      counselorId: "counselor-lin",
      revision: 1,
      session: {
        date: "2026-09-24",
        summary: "连续失眠两周，会谈中反复表达对裁员的灾难化预期，出现一次哭泣。",
        emotion: "焦虑、无力感",
        intervention: "认知解离练习，讨论危机应对预案，约定紧急联络方式。",
        nextPlan: "本周内加排一次会谈，评估自伤念头并联系精神科资源。",
      },
      archiveDue: "2026-09-30",
      reviewStatus: "pending",
      createdAt: iso("2026-09-10", "09:20"),
      updatedAt: iso("2026-09-24", "16:40"),
    },
    {
      id: "C-118",
      clientCode: "来访者B",
      topic: "亲子",
      risk: "低风险",
      teaching: true,
      status: "pending-review",
      counselorId: "counselor-zhao",
      revision: 1,
      session: {
        date: "2026-09-22",
        summary: "练习共情式回应后，与孩子冲突频率下降，本次复盘家庭作业。",
        emotion: "平稳、有信心",
        intervention: "角色扮演 + 家庭作业回顾。",
        nextPlan: "继续记录亲子互动日志，下周尝试一次完整非评判对话。",
      },
      archiveDue: "2026-10-08",
      reviewStatus: "pending",
      createdAt: iso("2026-08-28", "10:00"),
      updatedAt: iso("2026-09-22", "15:10"),
    },
    {
      id: "C-119",
      clientCode: "来访者C",
      topic: "亲密关系",
      risk: "低风险",
      teaching: false,
      status: "active",
      counselorId: "counselor-shen",
      originalCounselorId: "counselor-lin",
      transferredAt: iso("2026-09-18", "11:00"),
      transferredTo: "counselor-shen",
      revision: 1,
      session: {
        date: "2026-09-19",
        summary: "识别沟通中的回避模式；转组后首次会谈，已说明保密与边界。",
        emotion: "略紧张，愿意配合",
        intervention: "关系建立，回避模式心理教育。",
        nextPlan: "下次使用循环提问，探索回避背后的依恋需求。",
      },
      archiveDue: "2026-09-28",
      reviewStatus: "none",
      createdAt: iso("2026-07-15", "14:00"),
      updatedAt: iso("2026-09-19", "10:30"),
    },
    {
      id: "C-042",
      clientCode: "来访者D",
      topic: "焦虑",
      risk: "低风险",
      teaching: false,
      status: "archived",
      counselorId: "counselor-lin",
      revision: 1,
      session: {
        date: "2026-09-05",
        summary: "睡眠改善，能自主使用呼吸放松，会谈目标基本达成，协商结案。",
        emotion: "平稳",
        intervention: "结案回顾，巩固应对策略。",
        nextPlan: "一月后回访，必要时重新预约。",
      },
      archiveDue: "2026-09-12",
      reviewStatus: "addressed",
      createdAt: iso("2026-06-02", "09:00"),
      updatedAt: iso("2026-09-12", "17:00"),
    },
  ];

  const reviews: ReviewRecord[] = [
    {
      id: "review-C-203",
      caseId: "C-203",
      triggeredBy: "高风险",
      createdAt: iso("2026-09-24", "16:40"),
      lastSubmissionAt: iso("2026-09-24", "16:40"),
      comments: [
        {
          id: "rv-1",
          authorId: "supervisor-qin",
          content: "请补充自杀风险评估的具体问答记录，当前摘要无法判断意念强度。",
          createdAt: iso("2026-09-24", "18:05"),
          status: "open",
          revisionAtCreation: 1,
        },
        {
          id: "rv-2",
          authorId: "supervisor-qin",
          content: "危机预案需写明可联系的家属及 24 小时热线，并取得来访者知情同意。",
          createdAt: iso("2026-09-24", "18:08"),
          status: "open",
          revisionAtCreation: 1,
        },
      ],
    },
    {
      id: "review-C-118",
      caseId: "C-118",
      triggeredBy: "teaching",
      createdAt: iso("2026-09-22", "15:10"),
      lastSubmissionAt: iso("2026-09-22", "15:10"),
      comments: [
        {
          id: "rv-3",
          authorId: "supervisor-he",
          content: "教学个案：请标注角色扮演中咨询师的具体回应话术，便于组内研讨。",
          createdAt: iso("2026-09-23", "09:30"),
          status: "resolved",
          handledBy: "counselor-zhao",
          handledAt: iso("2026-09-23", "13:50"),
          handledNote: "已在干预方法中补记三轮回应话术原文。",
          resolvedBy: "supervisor-he",
          resolvedAt: iso("2026-09-23", "14:00"),
          revisionAtCreation: 1,
        },
        {
          id: "rv-4",
          authorId: "supervisor-he",
          content: "请补充家庭作业完成度（百分比）和未完成的原因。",
          createdAt: iso("2026-09-23", "09:32"),
          status: "open",
          revisionAtCreation: 1,
        },
      ],
    },
  ];

  const versions: ContentVersion[] = [
    {
      id: "av-C-042-1",
      caseId: "C-042",
      no: 1,
      stage: "archived",
      caseRevision: 1,
      savedAt: iso("2026-09-12", "17:00"),
      savedBy: "counselor-lin",
      note: "结案归档，督导意见已全部处理。",
      snapshot: {
        clientCode: "来访者D",
        topic: "焦虑",
        risk: "低风险",
        teaching: false,
        ...cases[3].session,
      },
    },
  ];

  return { cases, reviews, versions, drafts: [] };
}

/** 距归档期限剩余天数（负数表示已逾期） */
export function daysUntil(isoDate: string, from: string = TODAY): number {
  const due = new Date(isoDate + "T00:00:00");
  const now = new Date(from + "T00:00:00");
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

/** 业务基准日期 */
export const BUSINESS_TODAY = TODAY;

export function nowStamp(): string {
  // 演示环境以业务日期 2026-09-25 为基准，附当前时刻
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${TODAY}T${hh}:${mm}:00`;
}
