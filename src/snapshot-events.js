const eventName = "sprv-history-changed";
const sender = crypto.randomUUID();
export const snapshotConnectionKey = (connection) =>
  JSON.stringify(
    connection
      ? [
          connection.serverId,
          connection.deviceId,
          connection.supervisor.id,
          connection.endpoint,
          connection.supervisor.role || "supervisor",
          connection.supervisor.grade || "",
        ]
      : [],
  );

export function notifySnapshotChange(type, connection) {
  if (typeof window === "undefined") return;
  const detail = { type, identity: snapshotConnectionKey(connection), sender };
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
  if (typeof BroadcastChannel !== "undefined") {
    let channel;
    try {
      channel = new BroadcastChannel(eventName);
      channel.postMessage(detail);
    } catch {
      // Cross-tab signaling is optional; it must not turn a committed receipt
      // or snapshot save into an apparent failure. Visible tabs also poll.
    } finally {
      channel?.close();
    }
  }
}

export function subscribeSnapshotChanges(connection, listener) {
  const identity = snapshotConnectionKey(connection);
  const receive = (detail) => {
    if (detail?.identity === identity) listener(detail.type);
  };
  const local = (event) => receive(event.detail);
  window.addEventListener(eventName, local);
  let channel = null;
  try {
    if (typeof BroadcastChannel !== "undefined")
      channel = new BroadcastChannel(eventName);
  } catch {
    /* Continue with same-tab events and periodic checks. */
  }
  if (channel)
    channel.onmessage = (event) => {
      if (event.data?.sender !== sender) receive(event.data);
    };
  return () => {
    window.removeEventListener(eventName, local);
    channel?.close();
  };
}
