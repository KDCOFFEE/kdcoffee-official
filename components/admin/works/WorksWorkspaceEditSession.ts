"use client";

import type { WorksArtworkOwnerProjection as Model } from "@/lib/worksArtworkReadModel";

export const EDIT_FIELDS = {
  "content.hero": "hero.supportingCopy",
  "content.story": "story.body",
  "content.flavor": "flavor.narrative",
} as const;
export type EditFieldId = keyof typeof EDIT_FIELDS;
type Reader = (slug: string, signal?: AbortSignal) => Promise<{ ok: true; data: Model } | { ok: false; status: number }>;
export type EditSnapshot = {
  model: Model; drafts: Partial<Record<EditFieldId, string>>; editor: EditFieldId | null;
  busy: boolean; blocked: "" | "conflict" | "uncertain" | "review"; message: string;
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const isEditField = (id: string): id is EditFieldId => Object.hasOwn(EDIT_FIELDS, id);
export const baselineText = (model: Model, id: EditFieldId): string | null => {
  const field = model.fields.find(f => f.id === id);
  return field && field.state !== "invalid" && typeof field.value === "string" ? field.value : null;
};
export function textProblem(value: string): string | null {
  if (Array.from(value).length > 2000) return "請勿超過 2000 個字元。";
  if (value !== "" && value.trim() === "") return "請輸入文字，或使用清空明確留白。";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
    return "文字含有無法接受的字元，請確認後再儲存。";
  return null;
}
export function hasWritePreparation(model: Model): boolean {
  const p = model.writePreparation;
  return !!p && Number.isSafeInteger(p.worksRevision) && p.worksRevision >= 0 && /^w3e1\.[a-f0-9]{64}$/.test(p.editToken);
}
export const dirtyIds = (state: EditSnapshot): EditFieldId[] => Object.keys(state.drafts).filter(isEditField);
export function canSave(state: EditSnapshot): boolean {
  return !state.busy && !state.blocked && hasWritePreparation(state.model) && dirtyIds(state).length > 0 &&
    dirtyIds(state).every(id => !textProblem(state.drafts[id]!));
}
export function installDraftUnloadGuard(target: Pick<Window, "addEventListener" | "removeEventListener">, dirty: boolean) {
  if (!dirty) return () => {};
  const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
  target.addEventListener("beforeunload", handler);
  return () => target.removeEventListener("beforeunload", handler);
}
const errors: Record<number, string> = {
  400: "資料格式或內容無效，請確認文字後再試。",
  401: "登入狀態已失效，請重新登入。",
  403: "目前請求未通過權限或來源驗證，變更仍保留。",
  404: "找不到這件作品，請確認後再試。",
  413: "資料過大，請減少文字後再試。",
  415: "請求格式不正確，變更尚未儲存。",
  500: "儲存失敗，變更仍保留。",
};
const uncertain = "伺服器可能已完成儲存，請重新整理確認；請勿直接重複送出。";

// Client session only. The server remains authoritative for authorization,
// validation, CAS and persistence. requestId is correlation, never deduplication.
export class WorkspaceEditSession {
  private state: EditSnapshot;
  private listeners = new Set<() => void>();
  private active = true;
  private epoch = 0;
  private controller: AbortController | null = null;
  private pendingConfirmation: { drafts: EditSnapshot["drafts"]; committed: boolean } | null = null;
  constructor(model: Model, private slug: string, private reader: Reader,
    private validateModel: (v: unknown) => v is Model, private fetcher: typeof fetch = fetch,
    private nextRequestId: () => string = () => crypto.randomUUID()) {
    this.state = { model, drafts: {}, editor: null, busy: false, blocked: "", message: "" };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<EditSnapshot>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn());
  }
  activate() { this.active = true; }
  deactivate() { this.active = false; this.epoch++; this.controller?.abort(); }
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  open(id: string) {
    if (!isEditField(id) || this.state.busy || baselineText(this.state.model, id) === null) return;
    this.update({ editor: this.state.editor === id ? null : id });
  }
  change(id: string, value: string) {
    if (!isEditField(id) || this.state.busy || baselineText(this.state.model, id) === null) return;
    const drafts = { ...this.state.drafts };
    if (value === baselineText(this.state.model, id)) delete drafts[id]; else drafts[id] = value;
    this.update({ drafts, message: this.state.blocked ? this.state.message : "" });
  }
  clear(id: string) { this.change(id, ""); }
  discard() {
    if (!this.state.busy) this.update({ drafts: {}, editor: null, message: this.state.blocked ? this.state.message : "已取消變更" });
  }
  reviewDrafts() {
    if (this.state.blocked === "review" && !this.state.busy && hasWritePreparation(this.state.model))
      this.update({ blocked: "", message: "已確認保留的草稿；儲存前請再核對各欄目前內容。" });
  }
  private sameArtwork(model: Model) { return model.fields.find(f => f.id === "system.slug")?.value === this.slug; }
  private confirmed(model: Model, drafts: EditSnapshot["drafts"]) {
    return dirtyIds({ ...this.state, drafts }).every(id => {
      const f = model.fields.find(f => f.id === id);
      return f?.source.connected === true && f.state !== "invalid" && f.value === drafts[id];
    });
  }
  private async readLatest(signal: AbortSignal): Promise<Model | null> {
    const result = await this.reader(this.slug, signal).catch(() => null);
    return result?.ok && this.sameArtwork(result.data) && hasWritePreparation(result.data) ? result.data : null;
  }
  private async reconcile(epoch: number, signal: AbortSignal, submitted: EditSnapshot["drafts"], committed: boolean) {
    const model = await this.readLatest(signal);
    if (!this.current(epoch)) return;
    if (!model) { this.update({ blocked: "uncertain", message: uncertain }); return; }
    this.acceptReadback(model, submitted, committed);
  }
  private acceptReadback(model: Model, submitted: EditSnapshot["drafts"], committed: boolean) {
    this.pendingConfirmation = null;
    if (this.confirmed(model, submitted)) {
      const drafts = { ...this.state.drafts };
      for (const id of dirtyIds({ ...this.state, drafts: submitted })) {
        if (drafts[id] === submitted[id]) delete drafts[id];
      }
      this.update({ model, drafts, blocked: "", message: committed ? "儲存已提交，已重新確認最新內容" : "已重新確認儲存內容" });
    } else {
      this.update({ model, blocked: "review", message: "已取得最新內容，草稿仍保留。請對照目前內容，確認後再套用草稿。" });
    }
  }
  async reload() {
    if (this.state.busy) return;
    const epoch = ++this.epoch, controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    this.update({ busy: true });
    try {
      const model = await this.readLatest(controller.signal);
      if (!this.current(epoch)) return;
      if (!model) this.update({ message: "目前無法取得最新內容，草稿仍保留；請稍後重新載入。" });
      else if (this.pendingConfirmation) this.acceptReadback(model, this.pendingConfirmation.drafts, this.pendingConfirmation.committed);
      else this.update({ model, blocked: "review", message: "已取得最新內容，草稿仍保留。請對照目前內容，確認後再套用草稿。" });
    } finally { clearTimeout(timer); if (this.current(epoch)) this.update({ busy: false }); }
  }
  async save() {
    if (!this.active || !canSave(this.state)) return;
    const submitted = { ...this.state.drafts }, preparation = this.state.model.writePreparation!;
    const requestId = this.nextRequestId();
    const payload = {
      contractVersion: 1, expectedWorksRevision: preparation.worksRevision, expectedEditToken: preparation.editToken, requestId,
      operations: dirtyIds(this.state).map(id => ({ scope: "updateEditorialContent", field: EDIT_FIELDS[id], state: { mode: "value", value: submitted[id]! } })),
    };
    const epoch = ++this.epoch, controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    this.update({ busy: true, message: "正在儲存變更…" });
    try {
      // Native Web IDL fetch must not receive this session as its receiver.
      const fetcher = this.fetcher;
      const response = await fetcher("/api/admin/works/" + encodeURIComponent(this.slug) + "/owner-write", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!this.current(epoch)) return;
      if (response.status === 409) {
        this.update({ blocked: "conflict", message: "內容已在其他地方更新，請先取得最新版本再確認變更。" });
        return;
      }
      if ([400, 401, 403, 404, 413, 415].includes(response.status)) { this.update({ message: errors[response.status] }); return; }
      const body: unknown = await response.json().catch(() => null);
      if (!this.current(epoch)) return;
      if (response.ok && object(body) && body.ok === true && body.requestId === requestId &&
          ["SAVED", "NO_CHANGE"].includes(body.outcome as string) && this.validateModel(body.ownerModel) &&
          this.sameArtwork(body.ownerModel) && hasWritePreparation(body.ownerModel) &&
          body.worksRevision === body.ownerModel.writePreparation!.worksRevision && body.editToken === body.ownerModel.writePreparation!.editToken &&
          this.confirmed(body.ownerModel, submitted)) {
        this.update({ model: body.ownerModel, drafts: {}, blocked: "", message: "已儲存" });
      } else if (response.status === 500 && object(body) && object(body.error) && body.error.commitState === "NOT_COMMITTED") {
        this.update({ message: errors[500] });
      } else {
        // Fresh independent GET: never re-use an aborted POST signal.
        clearTimeout(timer);
        await this.recover(epoch, submitted, object(body) && object(body.error) && body.error.commitState === "COMMITTED");
      }
    } catch {
      if (this.current(epoch)) {
        clearTimeout(timer);
        await this.recover(epoch, submitted, false);
      }
    } finally { clearTimeout(timer); if (this.current(epoch)) this.update({ busy: false }); }
  }
  private async recover(epoch: number, submitted: EditSnapshot["drafts"], committed: boolean) {
    this.pendingConfirmation = { drafts: submitted, committed };
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    this.update({ blocked: "uncertain", message: "正在重新確認伺服器內容，請勿重複送出…" });
    try { await this.reconcile(epoch, controller.signal, submitted, committed); }
    finally { clearTimeout(timer); }
  }
}
