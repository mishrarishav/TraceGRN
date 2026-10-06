function normalizeUid(value: string): string | null {
  const uid = value.trim().toUpperCase();
  const guid =
    /^(?:LBL-)?([A-F0-9]{8})-?([A-F0-9]{4})-?([A-F0-9]{4})-?([A-F0-9]{4})-?([A-F0-9]{12})$/.exec(
      uid,
    );
  if (guid) return `LBL-${guid.slice(1).join("")}`;
  return /^LBL-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(uid) ? uid : null;
}

/** Read only the identifier; quantities and other QR fields are never trusted for issue. */
export function extractLabelUid(scannedValue: string): string | null {
  const value = scannedValue.trim();
  const field = /(?:^|\s)Label(?:[ \t]+(?:ID|UID))?[ \t]*:[ \t]*(\S+)/i.exec(value);
  return normalizeUid(field?.[1] ?? value);
}
