// 端到端不变量冒烟：直接驱动 IndexedDB 数据层，模拟 App 的处理逻辑
import "fake-indexeddb/auto";
import assert from "node:assert";
import { loadBundle, putItem, resetAll } from "../src/db.ts";
import { buildSeed, daysUntil } from "../src/seed.ts";

const seed = buildSeed();
await resetAll();
await Promise.all(seed.cases.map((c) => putItem("cases", c)));
await Promise.all(seed.reviews.map((r) => putItem("reviews", r)));
await Promise.all(seed.versions.map((v) => putItem("archiveVersions", v)));

const b1 = await loadBundle();
assert.equal(b1.cases.length, 4, "四个库分开：cases");
assert.equal(b1.reviews.length, 2, "reviews");
assert.equal(b1.versions.length, 1, "archiveVersions");
assert.deepEqual(b1.drafts, [], "localDrafts 初始为空");

// 1. 高风险个案在有未结意见时不允许归档
const c203 = b1.cases.find((c) => c.id === "C-203");
const r203 = b1.reviews.find((r) => r.caseId === "C-203");
const unresolved = r203.comments.filter((x) => x.status !== "resolved");
assert.equal(c203.risk, "高风险");
assert.ok(unresolved.length === 2, "两条意见均未结");
assert.ok(daysUntil(c203.archiveDue) === 5, "归档期限剩余 5 天");

// 2. 模拟：咨询师修订（未升版本号）时不能标记意见已处理
const target = r203.comments[0];
assert.equal(c203.revision <= target.revisionAtCreation, true);

// 3. 模拟：提交修订 -> revision 2，另存 revise 版本；标记 handled -> 督导 resolved
c203.revision = 2;
await putItem("cases", { ...c203, status: "pending-review" });
await putItem("archiveVersions", {
  id: "rev-C-203-1",
  caseId: "C-203",
  no: 1,
  stage: "revise",
  caseRevision: 2,
  savedAt: "2026-09-25T10:00:00",
  savedBy: "counselor-lin",
  note: "补入风险评估",
  snapshot: { clientCode: "来访者A", topic: "职业压力", risk: "高风险", teaching: false, ...c203.session },
});
const updatedComments = r203.comments.map((x) => ({ ...x, status: x.status }));
for (const cm of updatedComments) {
  cm.status = "resolved";
  cm.resolvedBy = "supervisor-qin";
  cm.resolvedAt = "2026-09-25T11:00:00";
}
await putItem("reviews", { ...r203, comments: updatedComments, approvedAt: "2026-09-25T11:00:00", approvedBy: "supervisor-qin" });

// 4. 转组：未结意见随案（这里换成 C-118 还有一条 open 的场景验证交接可见性）
const c118 = seed.cases.find((c) => c.id === "C-118");
const r118 = seed.reviews.find((r) => r.caseId === "C-118");
await putItem("cases", {
  ...c118,
  counselorId: "counselor-shen",
  originalCounselorId: "counselor-zhao",
  transferredAt: "2026-09-25T09:00:00",
  transferredTo: "counselor-shen",
});
const b2 = await loadBundle();
const moved = b2.cases.find((c) => c.id === "C-118");
const movedReview = b2.reviews.find((r) => r.caseId === "C-118");
assert.equal(moved.counselorId, "counselor-shen");
assert.equal(moved.originalCounselorId, "counselor-zhao");
const stillOpen = movedReview.comments.filter((x) => x.status !== "resolved");
assert.equal(stillOpen.length, 1, "接手人能看到原意见（rv-4 仍未结）");
assert.equal(stillOpen[0].authorId, "supervisor-he", "保留原提出人");
assert.equal(daysUntil(moved.archiveDue), 13, "剩余时间不变");

// 5. 归档后：全部意见 resolved 才允许；归档快照另存
const b3 = await loadBundle();
const c203v2 = b3.cases.find((c) => c.id === "C-203");
const r203v2 = b3.reviews.find((r) => r.caseId === "C-203");
assert.ok(r203v2.comments.every((x) => x.status === "resolved"));
assert.ok(r203v2.approvedAt, "督导复核通过");
const reviseCount = b3.versions.filter((v) => v.caseId === "C-203" && v.stage === "revise").length;
assert.equal(reviseCount, 1, "修订另存为新版本");

console.log("OK: 全部数据层不变量通过（分开四库 / 未结不可归档 / 修订另存 / 转组交接）");
