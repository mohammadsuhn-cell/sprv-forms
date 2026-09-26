# Optional general-supervisor connection

26 September 2026. Activated devices can send saved forms to the separate sprv receiver. Existing unactivated browsers remain local. The static GitHub site does not store submissions or contain real student lists.

Open the personal activation link supplied by the general supervisor, review the assigned name and grade, and select **تفعيل الاتصال**. The link is valid for one device and 30 minutes. No phone app or VPN installation is required when the receiver has a public HTTPS tunnel address.

- **حفظ** persists the form and queues its delivery. Draft autosaves and exports do not submit forms.
- **بانتظار الإرسال** means there is no confirmed receipt for the current saved revision. **تم الاستلام** includes the laptop's receipt time in Kuwait time.
- The phone retries on open, visibility/online events, and every 15 seconds while visible. If the laptop is off, reopen the forms when it becomes available. The tunnel stores no pending mailbox for the app.
- **تحتاج مراجعة** identifies a rejected submission or version conflict. Inspect it under Settings; retry does not overwrite a conflicting server record.
- The activated name/grade are fixed connection identity. Devices can be revoked from the local app without deleting received history.
- Earlier saved records matching the activated supervisor's name/grade can be explicitly queued from Settings. They are not silently attributed to a newly activated identity.
- Deleting a local saved copy does not withdraw a queued or received submission. Retraction is not part of this pilot.
- The non-exportable signing key and queue live in IndexedDB, separately from portable JSON backups. Browser-data clearing removes them. Backup files preserve forms, drafts and roster; they do not authorize a replacement device.
- Roster/settings synchronization and filtered supervisor recovery JSON are future work. Submitted absence sheets include their historical roll as part of the saved form; this is not a separate complete roster synchronization.

The public receiver accepts only signed submissions and activation requests. The local app's administration, personal register and received-record reading API remain on loopback. A delivery receipt is issued after the SQLite transaction commits. Repeated delivery returns the same receipt; received revisions retain their history. A second device cannot overwrite the first device's record without a future reconciliation workflow.

Implementation: `src/delivery.js`, `src/delivery-ui.jsx`. Device authentication uses WebCrypto ECDSA P-256. Connection tests run from the sibling sprv repo with synthetic data: `npm run check:connection`. The normal forms/export checks also verify unactivated operation stays local.
