import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  CaseVersion,
  CounselorCase,
  DraftForm,
  LocalState,
  ReviewOpinion,
} from "./types";

/**
 * 四类数据分开维护，各自独立的本机命名空间：
 * - cases    个案台账
 * - reviews  复核记录（督导意见及处理）
 * - versions 归档版本（每次修改另存的新版本）
 * - local    本机保存（当前角色、选中个案、未提交的登记草稿）
 */
export const STORE_KEYS = {
  cases: "hxwl12.cases.v1",
  reviews: "hxwl12.reviews.v1",
  versions: "hxwl12.versions.v1",
  local: "hxwl12.local.v1",
} as const;

export type StoreKey = keyof typeof STORE_KEYS;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function usePersistentState<T>(
  storeKey: StoreKey,
  initial: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const key = STORE_KEYS[storeKey];
  const [state, setState] = useState<T>(() => read<T>(key, initial));

  useEffect(() => {
    write(key, state);
  }, [key, state]);

  const reset = () => setState(initial);
  return [state, setState, reset];
}

/** 只清空某一类数据，不影响其他三类 */
export function clearStore(storeKey: StoreKey) {
  localStorage.removeItem(STORE_KEYS[storeKey]);
}

export function countStore(storeKey: StoreKey): number {
  const raw = localStorage.getItem(STORE_KEYS[storeKey]);
  if (!raw) return 0;
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") {
      if (storeKey === "local") {
        const local = value as LocalState;
        return Object.keys(local.drafts ?? {}).length;
      }
      return Object.keys(value).length;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** 以今天为基准生成 YYYY-MM-DD，offset 为天数偏移 */
export function dateOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T23:59:59`).getTime();
  return Math.ceil((target - Date.now()) / 86_400_000);
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** 意见处理剩余时间：从提出时刻起算 deadlineDays 天 */
export function opinionDaysLeft(opinion: ReviewOpinion): number {
  const due = opinion.raisedAt + opinion.deadlineDays * 86_400_000;
  return Math.ceil((due - Date.now()) / 86_400_000);
}

export function defaultLocalState(): LocalState {
  return {
    role: "counselor",
    currentCounselor: "李敏",
    currentSupervisor: "王督导",
    selectedCaseId: null,
    activeTab: "register",
    drafts: {},
  };
}

export interface SeedBundle {
  cases: CounselorCase[];
  reviews: ReviewOpinion[];
  versions: CaseVersion[];
}

/** 首次打开时的演示数据：覆盖 待登记 / 待复核 / 可归档 / 已归档 / 教学 / 转组 场景 */
export function buildSeed(now = Date.now()): SeedBundle {
  const day = 86_400_000;

  const c042: CounselorCase = {
    id: "case-c042",
    code: "C-042",
    topic: "焦虑",
    ownerCounselor: "李敏",
    sessionDate: dateOffset(-6),
    summary:
      "来访者报告近两周入睡困难，工作汇报前心悸。本次练习腹式呼吸与着陆技术，情绪由 8 分降至 5 分。",
    risk: "attention",
    teaching: false,
    nextPlan: "继续睡眠记录，每日两次呼吸放松练习，下周演练汇报场景暴露。",
    archiveDeadline: dateOffset(8),
    registeredAt: now - 6 * day,
    updatedAt: now - 6 * day,
    archived: false,
    reviewPassedAt: null,
    currentVersion: 2,
    transferHistory: [],
  };

  const c203: CounselorCase = {
    id: "case-c203",
    code: "C-203",
    topic: "职业压力",
    ownerCounselor: "周航", // 原负责人李敏，已转组给周航
    sessionDate: dateOffset(-9),
    summary:
      "来访者连续加班后出现自伤念头（用指甲掐手臂），无具体计划，社会支持薄弱。已做安全评估并约定危机联络方式。",
    risk: "high",
    teaching: false,
    nextPlan: "本周增加一次会谈，联系家属告知 24 小时危机热线；复评自杀风险并形成书面安全计划。",
    archiveDeadline: dateOffset(1),
    registeredAt: now - 9 * day,
    updatedAt: now - 2 * day,
    archived: false,
    reviewPassedAt: null,
    currentVersion: 2,
    transferHistory: [
      {
        fromCounselor: "李敏",
        toCounselor: "周航",
        at: now - 2 * day,
        note: "咨询师轮岗，高风险个案连同未结督导意见一并交接。",
      },
    ],
  };

  const c305: CounselorCase = {
    id: "case-c305",
    code: "C-305",
    topic: "亲子",
    ownerCounselor: "陈雨桐",
    sessionDate: dateOffset(-3),
    summary:
      "母亲陪同，讨论青春期孩子厌学与对抗。家庭沟通中存在大量「应该」句式，本次尝试非暴力观察-感受-需要-请求四步。",
    risk: "stable",
    teaching: true,
    nextPlan: "家庭作业：记录三次冲突时刻的观察与感受；督导示范家长回应脚本。",
    archiveDeadline: dateOffset(11),
    registeredAt: now - 3 * day,
    updatedAt: now - 3 * day,
    archived: false,
    reviewPassedAt: null,
    currentVersion: 1,
    transferHistory: [],
  };

  const c119: CounselorCase = {
    id: "case-c119",
    code: "C-119",
    topic: "亲密关系",
    ownerCounselor: "李敏",
    sessionDate: dateOffset(-12),
    summary:
      "识别出冲突中的回避模式，来访者能主动表达一次需求，伴侣回应积极。情绪稳定，目标基本达成。",
    risk: "stable",
    teaching: false,
    nextPlan: "一个月后随访一次，巩固沟通成果。",
    archiveDeadline: dateOffset(-2),
    registeredAt: now - 12 * day,
    updatedAt: now - 10 * day,
    archived: true,
    archivedAt: now - 4 * day,
    reviewPassedAt: null,
    currentVersion: 1,
    transferHistory: [],
  };

  const c508: CounselorCase = {
    id: "case-c508",
    code: "C-508",
    topic: "职业压力",
    ownerCounselor: "李敏",
    sessionDate: dateOffset(-1),
    summary: "",
    risk: "attention",
    teaching: false,
    nextPlan: "",
    archiveDeadline: dateOffset(13),
    registeredAt: now - day,
    updatedAt: now - day,
    archived: false,
    reviewPassedAt: null,
    currentVersion: 0,
    transferHistory: [],
  };

  const reviews: ReviewOpinion[] = [
    {
      id: "rev-c042-1",
      caseId: c042.id,
      supervisor: "王督导",
      category: "记录规范",
      content: "摘要需补充情绪量表的具体分值，干预方法请注明依据的咨询协议。",
      raisedAt: now - 5 * day,
      deadlineDays: 7,
      resolved: false,
    },
    {
      id: "rev-c203-1",
      caseId: c203.id,
      supervisor: "王督导",
      category: "风险干预",
      content: "安全计划须包含可联络家属与热线，并在 48 小时内复评自伤风险等级。",
      raisedAt: now - 8 * day,
      deadlineDays: 3,
      resolved: true,
      resolvedAt: now - 3 * day,
      resolution:
        "已补充书面安全计划（家属、热线、环境安全三步），并于两天内完成复评，等级降为关注。",
      resolvedBy: "李敏",
    },
    {
      id: "rev-c203-2",
      caseId: c203.id,
      supervisor: "赵督导",
      category: "伦理边界",
      content: "高风险个案增加会谈频次前，请先完成知情同意补签并记录告知内容。",
      raisedAt: now - 4 * day,
      deadlineDays: 5,
      resolved: false,
    },
    {
      id: "rev-c305-1",
      caseId: c305.id,
      supervisor: "王督导",
      category: "教学讨论",
      content: "请在下次个案报告中复盘四步沟通的卡点，并准备 5 分钟示范录像。",
      raisedAt: now - 2 * day,
      deadlineDays: 10,
      resolved: false,
    },
  ];

  const versions: CaseVersion[] = [
    {
      id: "ver-c042-1",
      caseId: c042.id,
      version: 1,
      reason: "首次登记",
      createdAt: now - 6 * day,
      createdBy: "李敏",
      archived: false,
      snapshot: {
        summary:
          "来访者报告近两周入睡困难，工作汇报前紧张。本次进行放松训练。",
        risk: "attention",
        teaching: false,
        nextPlan: "练习呼吸放松。",
        archiveDeadline: dateOffset(8),
      },
    },
    {
      id: "ver-c042-2",
      caseId: c042.id,
      version: 2,
      reason: "按督导意见补充情绪评分与干预细节",
      createdAt: now - 5 * day,
      createdBy: "李敏",
      archived: false,
      snapshot: {
        summary: c042.summary,
        risk: c042.risk,
        teaching: c042.teaching,
        nextPlan: c042.nextPlan,
        archiveDeadline: c042.archiveDeadline,
      },
    },
    {
      id: "ver-c203-1",
      caseId: c203.id,
      version: 1,
      reason: "首次登记",
      createdAt: now - 9 * day,
      createdBy: "李敏",
      archived: false,
      snapshot: {
        summary:
          "来访者连续加班后出现自伤念头，无具体计划。已做安全评估。",
        risk: "high",
        teaching: false,
        nextPlan: "增加会谈，联系家属。",
        archiveDeadline: dateOffset(1),
      },
    },
    {
      id: "ver-c203-2",
      caseId: c203.id,
      version: 2,
      reason: "处理第 1 条督导意见：补充书面安全计划",
      createdAt: now - 3 * day,
      createdBy: "李敏",
      archived: false,
      snapshot: {
        summary: c203.summary,
        risk: c203.risk,
        teaching: c203.teaching,
        nextPlan: c203.nextPlan,
        archiveDeadline: c203.archiveDeadline,
      },
    },
    {
      id: "ver-c305-1",
      caseId: c305.id,
      version: 1,
      reason: "首次登记",
      createdAt: now - 3 * day,
      createdBy: "陈雨桐",
      archived: false,
      snapshot: {
        summary: c305.summary,
        risk: c305.risk,
        teaching: c305.teaching,
        nextPlan: c305.nextPlan,
        archiveDeadline: c305.archiveDeadline,
      },
    },
    {
      id: "ver-c119-1",
      caseId: c119.id,
      version: 1,
      reason: "首次登记（归档版）",
      createdAt: now - 10 * day,
      createdBy: "李敏",
      archived: true,
      archivedAt: now - 4 * day,
      snapshot: {
        summary: c119.summary,
        risk: c119.risk,
        teaching: c119.teaching,
        nextPlan: c119.nextPlan,
        archiveDeadline: c119.archiveDeadline,
      },
    },
  ];

  return { cases: [c042, c203, c305, c119, c508], reviews, versions };
}
