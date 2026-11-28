import React from "react";

export function SnapshotStatus({
  bundle,
  busy,
  offline,
  error,
  checkedAt,
  lang,
  t,
}) {
  const time = (value) =>
    new Date(value).toLocaleString(lang === "en" ? "en-GB" : "ar-KW", {
      timeZone: "Asia/Kuwait",
    });
  return (
    <div role="status">
      <strong>
        {offline
          ? t("دون اتصال · النسخة المحفوظة", "Offline · saved copy")
          : busy
            ? t("جارٍ التحقق من التحديثات…", "Checking for updates…")
            : error
              ? t(
                  "تعذّر التحقق من أحدث البيانات",
                  "Could not check for updates",
                )
              : checkedAt
                ? t("تم التحقق من جهاز الاستقبال", "Checked with receiver")
                : t("بانتظار التحقق من التحديثات", "Awaiting update check")}
      </strong>
      {checkedAt && (
        <span>
          {t("آخر تحقق ناجح", "Last successful check")}: {time(checkedAt)}
        </span>
      )}
      {bundle && (
        <span>
          {t("بيانات النسخة المحفوظة حتى", "Saved data as of")}:{" "}
          {time(bundle.payload.capturedAt)}
        </span>
      )}
    </div>
  );
}
