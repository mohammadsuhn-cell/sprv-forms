// Reload at least the part of the list the supervisor has already opened, using
// fresh cursors throughout. Publish it as one result, never mix two snapshots.
export async function readHistoryWindow(
  read,
  action,
  params,
  listKey,
  count,
  active = () => true,
) {
  let page = await read(action, params);
  const items = [...page[listKey]];
  const seen = new Set();
  while (active() && items.length < count && page.nextCursor) {
    if (seen.has(page.nextCursor))
      throw Object.assign(Error("Repeated cursor"), {
        code: "pagination_expired",
      });
    seen.add(page.nextCursor);
    page = await read(action, { ...params, cursor: page.nextCursor });
    items.push(...page[listKey]);
  }
  if (!active()) throw new DOMException("Cancelled", "AbortError");
  return { ...page, [listKey]: items };
}
