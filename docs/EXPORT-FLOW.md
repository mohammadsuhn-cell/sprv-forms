# File export flow

Selecting PDF, Word or Excel generates a Blob on the device. It does not navigate, download automatically, or open a popup. A fixed file panel then offers Download, Share, and a separate-tab preview for PDF. Closing the panel returns to the form actions. Editing or navigating clears outdated exports.

Download links use `target="_blank"` and `rel="noopener noreferrer"`. This also applies to the backup download helper and the static template links. If a browser previews a download, it should not replace the working form tab. Download/preview URLs are short-lived local object URLs; no student data is uploaded.

Sharing remains a direct user click after generation, so slow generation does not consume the user-activation window. Unsupported sharing falls back to Download; canceling the native share sheet preserves the prepared file and form. An opened preview retains its own tab while the form remains open.

References:
- [WebKit user activation](https://webkit.org/blog/13862/the-user-activation-api/)
- [Anchor download and target behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)

## Validation

`npm run check:file-flow` checks Chromium with synthetic data, delayed generation, separate PDF preview, PDF/Word/Excel downloads, fresh-gesture sharing/cancellation, preserved drafts, stale-result cancellation, Arabic/English layout and offline use.

Use `FILE_FLOW_BROWSER=all npm run check:file-flow` to include WebKit, or `FILE_FLOW_BROWSER=webkit` for WebKit alone. Install Playwright's browser binaries first.

On macOS 14, Playwright 1.63's frozen WebKit build rejects the driver's `PushAPIEnabled` override before the app opens. The test accepts `SPRV_WEBKIT_DRIVER=file:///path/to/compatible/playwright/index.mjs` to use an isolated compatible driver and its assertions without changing project dependencies. Playwright 1.58.2 was used with the installed frozen build for the local check.

The frozen WebKit build errors internally during an emulated offline reload. Its test therefore checks offline export in the already-open form; Chromium also checks offline reload.

Physical iPhone Safari and its native share sheet still require an on-device check. The automated share test uses a stub to verify user activation, cancellation and file metadata.
