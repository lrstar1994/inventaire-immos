export const DEFAULT_AUTH_RETURN_PATH = "/";

export function normalizeInternalReturnPath(value, fallback = DEFAULT_AUTH_RETURN_PATH) {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > 2048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }
  try {
    const decoded = decodeURIComponent(candidate);
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }
  return candidate;
}
