import React, { useEffect, useMemo, useRef, useState } from "react";
import { ReadContext, useReads } from "./read-context.jsx";
import {
  readSchoolSnapshotPage,
  readSavedSchoolSnapshot,
  saveSchoolSnapshot,
  blockSchoolSnapshot,
} from "./delivery.js";
import {
  createSnapshotReader,
  downloadSchoolSnapshot,
  parseSnapshotBackup,
  snapshotBackupText,
  snapshotMaxBytes,
  validateSnapshotBundle,
} from "./school-snapshot.js";
import { FileActions } from "./file-actions.jsx";

const formatTime = (time, lang) =>
  new Date(time).toLocaleString(lang === "en" ? "en-GB" : "ar-KW", {
    timeZone: "Asia/Kuwait",
  });
function message(error, t) {
  if (error.code === "snapshot_owner")
    return t(
      "هذه النسخة لحساب مشرف أو جهاز استقبال آخر. فعّل الحساب نفسه أولًا.",
      "This backup belongs to another supervisor account or receiver. Activate the same account first.",
    );
  if (error.code === "snapshot_invalid")
    return t(
      "ملف النسخة غير صالح أو غير مكتمل. لم تتغير النسخة المحفوظة.",
      "The snapshot file is invalid or incomplete. Your saved copy was not changed.",
    );
  if (error.code === "snapshot_scope")
    return t(
      "هذه النسخة لا تطابق صلاحية الحساب أو صفه. لم تتغير النسخة المحفوظة.",
      "This snapshot does not match the account's role or grade. Your saved copy was not changed.",
    );
  if (error.code === "snapshot_limit")
    return t(
      "حجم نسخة المدرسة أكبر من الحد المتاح. لم تتغير النسخة المحفوظة.",
      "The school snapshot exceeds the supported size. Your saved copy was not changed.",
    );
  if (error.code === "snapshot_older")
    return t(
      "النسخة الواردة أقدم من المحفوظة. تحقق من وقت جهاز الاستقبال.",
      "The received snapshot is older than your saved copy. Check the receiver clock.",
    );
  if (error.code === "revoked" || error.status === 403)
    return t(
      "أُلغي وصول هذا الجهاز. راجع الإشراف لتفعيل الاتصال.",
      "Access for this device was withdrawn. Contact supervision to activate it.",
    );
  if (error.code === "unpaired")
    return t(
      "تغير اتصال الجهاز. افتح الصفحة مجددًا.",
      "The device connection changed. Reopen this page.",
    );
  if (error.status === 404)
    return t(
      "يحتاج جهاز الاستقبال إلى تحديث لتوفير نسخة المدرسة.",
      "Update the receiver to enable school snapshots.",
    );
  if (error.name === "QuotaExceededError")
    return t(
      "المساحة المتاحة على الجهاز لا تكفي. حرّر مساحة وأعد المحاولة؛ النسخة السابقة محفوظة.",
      "There is not enough device storage. Free space and retry; the previous copy is preserved.",
    );
  return t(
    "تعذّر إكمال العملية. تأكد من الاتصال وتشغيل جهاز الاستقبال ثم أعد المحاولة. النسخة السابقة محفوظة.",
    "The operation could not finish. Check the connection and receiver, then retry. The previous copy is preserved.",
  );
}

export function SchoolSnapshotWorkspace({
  connection,
  lang,
  t,
  children,
  active = true,
  showSettings = false,
  onSettings,
}) {
  const live = useReads();
  const gradeSnapshot = connection.supervisor.role !== "general";
  const updateLabel = gradeSnapshot
    ? t("تحديث سجل الصف", "Update grade history")
    : t("تحديث بيانات المدرسة", "Update school data");
  const backupLabel = gradeSnapshot
    ? t("تنزيل نسخة سجل الصف", "Download grade history backup")
    : t("تنزيل نسخة احتياطية", "Download backup");
  const restoreLabel = gradeSnapshot
    ? t("استعادة نسخة سجل الصف", "Restore grade history backup")
    : t("استعادة نسخة احتياطية", "Restore backup");
  const [bundle, setBundle] = useState(null),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [error, setError] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null),
    [file, setFile] = useState(null),
    [blocked, setBlocked] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const generation = useRef(0),
    working = useRef(false);
  const identity = JSON.stringify([
    connection.serverId,
    connection.deviceId,
    connection.supervisor.id,
    connection.endpoint,
    connection.supervisor.role,
    connection.supervisor.grade,
  ]);
  useEffect(() => {
    const version = ++generation.current;
    setReady(false);
    setBundle(null);
    setError(null);
    setBlocked(false);
    readSavedSchoolSnapshot(connection)
      .then(async (saved) => {
        if (saved) await validateSnapshotBundle(saved, connection);
        if (version === generation.current) setBundle(saved || null);
      })
      .catch((e) => {
        if (version === generation.current) {
          setError(e);
          setBlocked(e.code === "revoked");
        }
      })
      .finally(() => {
        if (version === generation.current) setReady(true);
      });
    const network = () => setOffline(!navigator.onLine);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      generation.current++;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, [identity]);
  const reader = useMemo(
    () => (bundle ? createSnapshotReader(bundle.payload) : live),
    [bundle, live],
  );
  async function run(operation) {
    if (working.current || !ready) return;
    working.current = true;
    const version = generation.current,
      active = () => version === generation.current;
    setBusy(true);
    setError(null);
    setFile(null);
    try {
      await operation(active);
    } catch (e) {
      if (!active()) return;
      if (e.code === "revoked" || e.code === "scope") {
        setBundle(null);
        setBlocked(true);
        setPendingRestore(null);
        await blockSchoolSnapshot(connection).catch(() => {});
      }
      if (active() && e.name !== "AbortError") setError(e);
    } finally {
      working.current = false;
      if (active()) {
        setBusy(false);
        setProgress(null);
      }
    }
  }
  function update() {
    setPendingRestore(null);
    return run(async (active) => {
      const next = await downloadSchoolSnapshot(
        readSchoolSnapshotPage,
        connection,
        (p) => {
          if (active()) setProgress(p);
        },
        active,
      );
      if (!active()) return;
      await saveSchoolSnapshot(next, connection, true);
      if (active()) {
        setBundle(next);
        setBlocked(false);
      }
      navigator.storage?.persist?.().catch(() => {});
    });
  }
  function inspectBackup(selected) {
    if (!selected) return;
    setPendingRestore(null);
    return run(async (active) => {
      if (selected.size > snapshotMaxBytes)
        throw Object.assign(Error("Large file"), { code: "snapshot_limit" });
      const next = await parseSnapshotBackup(await selected.text(), connection);
      if (active()) setPendingRestore(next);
    });
  }
  function restore() {
    return run(async (active) => {
      await saveSchoolSnapshot(pendingRestore, connection);
      if (active()) {
        setBundle(pendingRestore);
        setPendingRestore(null);
      }
    });
  }
  async function shareBackup() {
    const nativeFile = new File([file.blob], file.name, {
      type: file.blob.type,
    });
    try {
      if (navigator.canShare?.({ files: [nativeFile] }))
        await navigator.share({ files: [nativeFile], title: file.name });
      else (await import("./exports.js")).download(file.blob, file.name);
    } catch (e) {
      if (e.name !== "AbortError") setError(e);
    }
  }
  return (
    <>
      {(active || showSettings) && (
        <section
          className="panel school-snapshot-tools"
          aria-label={
            gradeSnapshot
              ? t("نسخة سجل الصف", "Grade history snapshot")
              : t("نسخة المدرسة", "School snapshot")
          }
        >
          {active && !showSettings ? (
            <div className="snapshot-status-bar">
              <div>
                <strong>
                  {bundle
                    ? t("آخر تحديث", "Last updated")
                    : gradeSnapshot
                      ? t("سجل الصف", "Grade history")
                      : t("بيانات المدرسة", "School data")}
                </strong>
                <span>
                  {bundle
                    ? formatTime(bundle.payload.capturedAt, lang)
                    : t(
                        "حدّث للاحتفاظ بنسخة دون اتصال",
                        "Update to keep an offline copy",
                      )}
                  {offline ? ` · ${t("دون اتصال", "Offline")}` : ""}
                </span>
              </div>
              <button
                className="primary"
                disabled={!ready || busy}
                onClick={update}
              >
                {updateLabel}
              </button>
              <button className="text-control" onClick={onSettings}>
                {t("النسخ الاحتياطية", "Backups")}
              </button>
            </div>
          ) : (
            <>
              <div>
                <strong>
                  {gradeSnapshot
                    ? t("سجل الصف المحفوظ", "Saved grade history")
                    : bundle
                      ? t(
                          "نسخة المدرسة محفوظة على هذا الجهاز",
                          "School snapshot saved on this device",
                        )
                      : t(
                          "احتفظ بنسخة المدرسة معك",
                          "Keep a copy of the school records",
                        )}
                </strong>
                <p className="hint">
                  {bundle ? (
                    <>
                      {t("آخر تحديث للبيانات", "Data last updated")}:{" "}
                      {formatTime(bundle.payload.capturedAt, lang)} ·{" "}
                      {bundle.payload.students.length} {t("طالب", "students")} ·{" "}
                      {bundle.payload.records.length} {t("تقرير", "reports")}
                      {offline ? " · " + t("دون اتصال", "Offline") : ""}
                    </>
                  ) : (
                    t(
                      gradeSnapshot
                        ? "حدّث سجل الصف أثناء اتصال جهاز الاستقبال، ثم تصفح سجل الطلبة وصدّره دون اتصال."
                        : "حدّث بيانات المدرسة أثناء اتصال جهاز الاستقبال، ثم تصفح السجلات والتقارير وصدّرها دون اتصال.",
                      "Update while the receiver is online, then browse and export the saved records offline.",
                    )
                  )}
                </p>
                {bundle && (
                  <p className="hint">
                    {t(
                      gradeSnapshot
                        ? "تعرض السجلات النسخة المحفوظة. تحديث سجل الصف يجلب التقارير والتعديلات الجديدة."
                        : "تعرض الصفحات النسخة المحفوظة. تحديث بيانات المدرسة يجلب جميع التقارير والتعديلات الجديدة.",
                      "Pages use your saved copy. Update to receive new reports and corrections.",
                    )}
                  </p>
                )}
              </div>
              <div className="history-actions">
                <button
                  className="primary"
                  disabled={!ready || busy}
                  onClick={update}
                >
                  {updateLabel}
                </button>
                <button
                  className="button"
                  disabled={!bundle || busy || blocked}
                  onClick={() =>
                    setFile({
                      name: `sprv-${gradeSnapshot ? "grade-" + bundle.payload.scope.grade : "general"}-${bundle.payload.capturedAt.slice(0, 10)}.json`,
                      blob: new Blob([snapshotBackupText(bundle)], {
                        type: "application/json",
                      }),
                    })
                  }
                >
                  {backupLabel}
                </button>
                <label className="button snapshot-restore-label">
                  {restoreLabel}
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={!ready || busy || blocked}
                    aria-label={restoreLabel}
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      e.target.value = "";
                      inspectBackup(selected);
                    }}
                  />
                </label>
              </div>
            </>
          )}
          {(!ready || busy) && (
            <p role="status">
              {!ready
                ? t("جارٍ فتح النسخة المحفوظة…", "Opening saved snapshot…")
                : progress
                  ? `${gradeSnapshot ? t("جارٍ تحديث سجل الصف…", "Updating grade history…") : t("جارٍ تحديث بيانات المدرسة…", "Updating school data…")} ${Math.round((progress.received / progress.total) * 100)}%`
                  : t("جارٍ تجهيز النسخة…", "Preparing snapshot…")}
            </p>
          )}
          {error && <p role="alert">{message(error, t)}</p>}
          {pendingRestore && (
            <section
              className="snapshot-restore-preview"
              aria-label={t("مراجعة النسخة", "Review backup")}
            >
              <p>
                {t("تاريخ النسخة", "Snapshot date")}:{" "}
                {formatTime(pendingRestore.payload.capturedAt, lang)} ·{" "}
                {pendingRestore.payload.students.length} {t("طالب", "students")}{" "}
                · {pendingRestore.payload.records.length}{" "}
                {t("تقرير", "reports")}
              </p>
              <p>
                {t(
                  gradeSnapshot
                    ? "ستحل هذه النسخة محل سجل الصف المحفوظ على هذا الجهاز."
                    : "ستحل هذه النسخة محل نسخة المدرسة المحفوظة على هذا الجهاز.",
                  "This will replace the saved history snapshot on this device.",
                )}
              </p>
              {bundle &&
                pendingRestore.payload.capturedAt <
                  bundle.payload.capturedAt && (
                  <p className="general-missing">
                    {t(
                      "النسخة المختارة أقدم من النسخة المحفوظة.",
                      "The selected backup is older than your saved snapshot.",
                    )}
                  </p>
                )}
              <button className="button" disabled={busy} onClick={restore}>
                {t("استعادة هذه النسخة", "Restore this snapshot")}
              </button>{" "}
              <button
                className="button"
                disabled={busy}
                onClick={() => setPendingRestore(null)}
              >
                {t("إلغاء", "Cancel")}
              </button>
            </section>
          )}
          {file && (
            <FileActions
              file={file}
              lang={lang}
              onShare={shareBackup}
              onClose={() => setFile(null)}
              onError={(value) => setError(Error(value))}
            />
          )}
        </section>
      )}
      {ready && !blocked && (
        <ReadContext.Provider
          key={bundle?.payload.snapshotId || "live"}
          value={reader}
        >
          <div hidden={!active}>{children}</div>
        </ReadContext.Provider>
      )}
    </>
  );
}
