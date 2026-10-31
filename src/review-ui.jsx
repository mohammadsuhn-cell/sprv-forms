import { shortCaseReference } from "./case-reference.js";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import {
  reviewCache,
  reviewScope,
  syncReviews,
  queueReview,
  reviewDetail,
  saveReviewDraft,
  removePendingReview,
  retryPendingReview,
  pendingReviewBackup,
  restorePendingReviews,
} from "./review-delivery.js";
import { titles, dateLabel, today } from "./model.js";
import { ReportContent } from "./student-history.jsx";

const Context = createContext(null);
export const useReviews = () => useContext(Context);
const empty = {
  threads: {},
  details: {},
  pending: [],
  drafts: {},
  fetchedAt: "",
  error: "",
};
const stamp = (date) =>
  new Date(date).toLocaleString("ar-KW", { timeZone: "Asia/Kuwait" });
const labels = {
  note: "ملاحظة",
  request: "طلب متابعة",
  reply: "رد",
  amend: "توضيح",
  open: "فتح المتابعة",
  acknowledge: "إقرار بالاطلاع",
  close: "إغلاق الطلب",
  reopen: "إعادة فتح الطلب",
  cancel: "إلغاء الطلب",
};

export function ReviewProvider({ connection, children }) {
  const scope = reviewScope(connection),
    supported = !!connection?.capabilities?.reviews;
  const [state, setState] = useState({ scope: "", data: empty });
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (!supported) return;
    setBusy(true);
    try {
      await syncReviews(connection);
    } catch {
      setState({
        scope,
        data: {
          ...empty,
          error: "تعذّر حفظ المتابعات على الجهاز؛ تحقق من مساحة التخزين",
        },
      });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data = await reviewCache(connection);
        if (live) setState({ scope, data });
      } catch {
        if (live)
          setState({
            scope,
            data: {
              ...empty,
              error: "تعذّر فتح المتابعات المحفوظة على الجهاز",
            },
          });
      }
    };
    const tick = () => {
      if (supported && document.visibilityState === "visible")
        void syncReviews(connection).catch(() => {
          if (live)
            setState({
              scope,
              data: {
                ...empty,
                error: "تعذّر حفظ المتابعات على الجهاز؛ تحقق من مساحة التخزين",
              },
            });
        });
    };
    load();
    if (supported) tick();
    const timer = setInterval(tick, 15000);
    window.addEventListener("sprv-reviews-changed", load);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("sprv-reviews-changed", load);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [scope, supported, connection?.deviceId, connection?.endpoint]);
  const data = state.scope === scope ? state.data : empty;
  return (
    <Context.Provider value={{ connection, supported, data, refresh, busy }}>
      {children}
    </Context.Provider>
  );
}

export function ReviewBadge({ t, onOpen }) {
  const ctx = useContext(Context);
  if (!ctx?.supported) return null;
  const unread = Object.values(ctx.data.threads).filter((t) => t.unread).length;
  return (
    <button className="button" onClick={onOpen}>
      {t("المتابعات", "Follow-ups")}{" "}
      {unread > 0 && <span className="count">{unread}</span>}
    </button>
  );
}

function Composer({ draftKey, t, label, onSubmit, options }) {
  const ctx = useContext(Context);
  const [text, setText] = useState(ctx.data.drafts[draftKey] || "");
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setText(ctx.data.drafts[draftKey] || "");
  }, [ctx.data.drafts[draftKey], draftKey]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
          await onSubmit(text);
          dirty.current = false;
          setText("");
          await ctx.refresh();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {options}
      <label className="field wide">
        <span>{label}</span>
        <textarea
          aria-label={label}
          value={text}
          maxLength={4000}
          rows={4}
          required
          disabled={busy}
          onChange={(e) => {
            dirty.current = true;
            setText(e.target.value);
            saveReviewDraft(ctx.connection, draftKey, e.target.value).catch(
              () =>
                setError(
                  t(
                    "تعذّر حفظ المسودة؛ احتفظ بالنص قبل الإغلاق",
                    "Draft could not be saved; keep the text before closing",
                  ),
                ),
            );
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy || !text.trim()}>
        {busy ? t("جارٍ الحفظ…", "Saving…") : t("إرسال", "Send")}
      </button>
    </form>
  );
}

function Thread({ thread, t }) {
  const ctx = useContext(Context),
    cached = ctx.data.details[thread.id];
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [replyType, setReplyType] = useState("reply");
  const reviewer = thread.reviewerId === ctx.connection.supervisor.id;
  useEffect(() => {
    if (open) void load();
  }, [open, thread.updatedSeq]);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await reviewDetail(ctx.connection, thread.id);
      if (
        data.thread.unread &&
        !ctx.data.pending.some(
          (p) =>
            p.operation.threadId === thread.id && p.operation.type === "open",
        )
      ) {
        await queueReview(ctx.connection, {
          type: "open",
          threadId: thread.id,
          through: data.thread.lastMessageSeq,
        });
        await ctx.refresh();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const send = async (type, text = "") => {
    await queueReview(
      ctx.connection,
      {
        type,
        text,
        threadId: thread.id,
        version: thread.version,
        through: thread.lastMessageSeq,
      },
      "reply:" + thread.id,
    );
  };
  const status = thread.archivedAt
    ? t("التقرير مسحوب", "Report withdrawn")
    : thread.status === "open"
      ? t("طلب مفتوح", "Open request")
      : thread.status === "closed"
        ? t("طلب مغلق", "Closed request")
        : thread.status === "cancelled"
          ? t("طلب ملغى", "Cancelled request")
          : t("ملاحظة", "Note");
  return (
    <details
      className="history-entry"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <strong>
          {shortCaseReference(thread.source?.reference) ||
            titles[thread.source?.kind]?.[0] ||
            t("تقرير", "Report")}
        </strong>{" "}
        · {thread.source?.date} · {status}
        {thread.unread && <span className="count">{t("جديد", "New")}</span>}
        <p>{thread.preview}</p>
        <small>
          {thread.reviewerName} → {thread.recipientName}
        </small>
      </summary>
      {thread.due && (
        <p>
          {t("موعد المتابعة", "Due")}: {dateLabel(thread.due)}{" "}
          {thread.status === "open" && thread.due < today()
            ? t(" · متأخرة", " · Overdue")
            : ""}
        </p>
      )}
      {thread.source?.revision !== thread.reportRevision && (
        <p className="hint">
          {t(
            "تتعلق هذه الملاحظة بنسخة سابقة من التقرير",
            "This note concerns an earlier report revision",
          )}{" "}
          ({thread.reportRevision})
        </p>
      )}
      {thread.archivedAt && (
        <p>
          {t(
            "أُرشفت المتابعة بسبب سحب التقرير؛ لا يعني ذلك اكتمال الإجراء.",
            "Archived because the report was withdrawn; this does not mean the action was completed.",
          )}
        </p>
      )}
      {error && (
        <p role="alert">
          {error}
          {cached &&
            t(" — تظهر النسخة المحفوظة.", " — Showing the saved copy.")}
        </p>
      )}
      <button className="button" disabled={busy} onClick={load}>
        {t("تحديث المحادثة", "Refresh conversation")}
      </button>
      {cached && (
        <>
          <ol className="review-events">
            {cached.events
              .filter((e) => e.operation.type !== "open")
              .map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.actorName} ·{" "}
                    {labels[e.operation.type] || e.operation.type}
                  </strong>
                  <small> · {stamp(e.receivedAt)}</small>
                  {e.operation.text && (
                    <p style={{ whiteSpace: "pre-wrap" }}>{e.operation.text}</p>
                  )}
                </li>
              ))}
          </ol>
          <details>
            <summary>
              {t(
                "التقرير عند كتابة الملاحظة",
                "Report when the note was written",
              )}
            </summary>
            {cached.report && <ReportContent report={cached.report} />}
          </details>
        </>
      )}
      {!reviewer &&
        (thread.read?.[ctx.connection.supervisor.id]?.acknowledgedThrough ||
          0) < thread.lastMessageSeq && (
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await send("acknowledge");
                await ctx.refresh();
                await load();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("إقرار بالاطلاع", "Acknowledge")}
          </button>
        )}
      {!thread.archivedAt &&
        open &&
        ctx.connection.capabilities?.reviewWrite !== false && (
          <Composer
            key={thread.id}
            draftKey={"reply:" + thread.id}
            t={t}
            label={t("الرد أو نتيجة المتابعة", "Reply or follow-up outcome")}
            options={
              reviewer && (
                <label className="field">
                  <span>{t("نوع التحديث", "Update type")}</span>
                  <select
                    aria-label={t("نوع التحديث", "Update type")}
                    value={replyType}
                    onChange={(e) => setReplyType(e.target.value)}
                  >
                    <option value="reply">{t("رد", "Reply")}</option>
                    <option value="amend">{t("توضيح", "Amendment")}</option>
                    {thread.kind === "request" &&
                      (thread.status === "open" ? (
                        <>
                          <option value="close">
                            {t(
                              "إغلاق الطلب بعد المراجعة",
                              "Close request after review",
                            )}
                          </option>
                          <option value="cancel">
                            {t("إلغاء الطلب", "Cancel request")}
                          </option>
                        </>
                      ) : (
                        <option value="reopen">
                          {t("إعادة فتح الطلب", "Reopen request")}
                        </option>
                      ))}
                  </select>
                </label>
              )
            }
            onSubmit={async (text) => {
              await send(reviewer ? replyType : "reply", text);
            }}
          />
        )}
    </details>
  );
}

export function ReviewPanel({
  recordId,
  revision,
  t,
  studentId,
  canCreate = false,
}) {
  const ctx = useContext(Context),
    [type, setType] = useState("note"),
    [due, setDue] = useState("");
  const restore = useRef(),
    [backupError, setBackupError] = useState("");
  if (!ctx?.supported) return null;
  const threads = Object.values(ctx.data.threads)
    .filter(
      (thread) =>
        (!recordId || thread.recordId === recordId) &&
        (!studentId || thread.studentIds?.includes(studentId)),
    )
    .sort((a, b) => b.updatedSeq - a.updatedSeq);
  const create =
    canCreate &&
    ctx.connection.capabilities?.review &&
    recordId &&
    !recordId.startsWith(ctx.connection.supervisor.id + ":");
  return (
    <section className="review-panel">
      <h2>{t("الملاحظات والمتابعة", "Notes and follow-up")}</h2>
      {!recordId && !studentId && (
        <details className="review-backups">
          <summary>{t("نسخ احتياطي", "Backup")}</summary>
          <div className="history-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  const backup = await pendingReviewBackup(ctx.connection);
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(backup, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "sprv-pending-notes-" + today() + ".json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                } catch (e) {
                  setBackupError(e.message);
                }
              }}
            >
              {t(
                "نسخة للمسودات والرسائل المنتظرة",
                "Back up drafts and pending notes",
              )}
            </button>
            <button className="button" onClick={() => restore.current.click()}>
              {t("استعادة مسودات المتابعات", "Restore review drafts")}
            </button>
            <input
              hidden
              ref={restore}
              type="file"
              accept=".json,application/json"
              aria-label={t("نسخة مسودات المتابعة", "Review drafts backup")}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 15000000) throw Error("الملف كبير");
                  await restorePendingReviews(
                    ctx.connection,
                    JSON.parse(await file.text()),
                  );
                  setBackupError("");
                } catch (e) {
                  setBackupError(e.message);
                }
              }}
            />
            {backupError && <p role="alert">{backupError}</p>}
          </div>
        </details>
      )}
      <div className="history-actions">
        <button className="button" onClick={ctx.refresh} disabled={ctx.busy}>
          {t("تحديث المتابعات", "Refresh notes")}
        </button>
        {ctx.data.fetchedAt && (
          <small>
            {t("آخر تحديث", "Last updated")}: {stamp(ctx.data.fetchedAt)}
          </small>
        )}
      </div>
      {ctx.data.error && <p role="alert">{ctx.data.error}</p>}
      {create && (
        <Composer
          key={recordId}
          draftKey={"new:" + recordId}
          t={t}
          label={t(
            "الملاحظة أو المطلوب متابعته",
            "Note or requested follow-up",
          )}
          options={
            <div className="fields">
              <label className="field">
                <span>{t("النوع", "Type")}</span>
                <select
                  aria-label={t("النوع", "Type")}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="note">{t("ملاحظة", "Note")}</option>
                  <option value="request">
                    {t("طلب متابعة", "Follow-up request")}
                  </option>
                </select>
              </label>
              {type === "request" && (
                <label className="field">
                  <span>{t("موعد اختياري", "Optional due date")}</span>
                  <input
                    aria-label={t("موعد اختياري", "Optional due date")}
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
              )}
            </div>
          }
          onSubmit={(text) =>
            queueReview(
              ctx.connection,
              {
                type,
                text,
                due: type === "request" ? due : "",
                threadId: crypto.randomUUID(),
                recordId,
                revision,
              },
              "new:" + recordId,
            )
          }
        />
      )}
      {ctx.data.pending
        .filter(
          (p) =>
            (!recordId ||
              p.operation.recordId === recordId ||
              ctx.data.threads[p.operation.threadId]?.recordId === recordId) &&
            (!studentId ||
              ctx.data.threads[p.operation.threadId]?.studentIds?.includes(
                studentId,
              )),
        )
        .map((p) => (
          <div className="panel" key={p.operation.id}>
            <strong>
              {p.blocked
                ? t("تحتاج مراجعة", "Needs review")
                : t("بانتظار الإرسال", "Waiting to send")}
            </strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{p.operation.text}</p>
            {p.error && <p role="alert">{p.error}</p>}
            {p.blocked && (
              <>
                <button
                  className="button"
                  onClick={async () => {
                    await retryPendingReview(ctx.connection, p.operation.id);
                    await ctx.refresh();
                  }}
                >
                  {t("إعادة المحاولة", "Retry")}
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (
                      confirm(
                        t(
                          "إزالة الرسالة من قائمة الإرسال؟ احتفظ بنصها إذا أردت إرسالها بعد مراجعة التقرير.",
                          "Remove this pending message? Keep its text if you want to send it after reviewing the report.",
                        ),
                      )
                    )
                      removePendingReview(ctx.connection, p.operation.id);
                  }}
                >
                  {t("إزالة من قائمة الإرسال", "Remove pending message")}
                </button>
              </>
            )}
          </div>
        ))}
      {threads.map((thread) => (
        <Thread key={thread.id} thread={thread} t={t} />
      ))}
      {!threads.length && ctx.data.fetchedAt && !ctx.data.error && (
        <p className="hint">
          {t(
            "لا توجد متابعات متاحة لك في هذه القائمة.",
            "No review threads are available to you in this list.",
          )}
        </p>
      )}
      <p className="hint">
        {t(
          "الإقرار بالاطلاع لا يعني تنفيذ الإجراء.",
          "Acknowledgement does not mean the action is completed.",
        )}
      </p>
    </section>
  );
}
