export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatLength(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return s === 1 ? "1 second" : `${s} seconds`;
  if (s === 0) return m === 1 ? "1 minute" : `${m} minutes`;
  return `${m} minute${m === 1 ? "" : "s"} and ${s} second${s === 1 ? "" : "s"}`;
}

export function memoryFilename(createdAt: number, mime: string): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ext =
    mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")
      ? "m4a"
      : "webm";
  return `jaunty-memory-${y}-${mo}-${day}-${hh}${mm}.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
