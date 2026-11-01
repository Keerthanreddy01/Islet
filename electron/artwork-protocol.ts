import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Permitted image extensions genuinely used by Islet's artwork assets.
 */
export const ALLOWED_ARTWORK_EXTENSIONS = new Set<string>([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
]);

export const EXTENSION_MIME_MAP: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export type ArtworkRequestResult =
  | {
      status: "valid_static";
      filePath: string;
      mimeType: string;
    }
  | {
      status: "valid_live";
    }
  | {
      status: "rejected";
      httpStatus: 400 | 403 | 404;
      error: string;
    };

/**
 * Returns the default absolute path to the assets/artwork directory.
 */
export function getDefaultArtworkDir(): string {
  return path.resolve(__dirname, "../assets/artwork");
}

/**
 * Validates and resolves an `islet-art://` request URL against path traversal,
 * URL-encoded traversal, absolute paths, escaping symlinks, directory targets,
 * and unsupported extensions.
 */
export function resolveArtworkPath(
  requestUrl: string,
  artworkDir: string = getDefaultArtworkDir()
): ArtworkRequestResult {
  // 1. Basic URL scheme and string validation
  if (typeof requestUrl !== "string" || !requestUrl.startsWith("islet-art:")) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Invalid protocol scheme"
    };
  }

  // 2. Reject absolute path patterns in URL scheme / host
  // e.g., islet-art://C:/..., islet-art:///C:/..., islet-art://\\server..., islet-art:////...
  if (
    /^islet-art:\/{2,3}[a-zA-Z]:/i.test(requestUrl) ||
    /^islet-art:\/{2,3}[\\\/]{2}/.test(requestUrl) ||
    /^islet-art:\/{2,3}\\\\/i.test(requestUrl)
  ) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Absolute path patterns are forbidden"
    };
  }

  // 3. Reject raw traversal and dangerous encoding sequences:
  // - ".."
  // - encoded dots: "%2e%2e", "%2e.", ".%2e"
  // - encoded slashes: "%2f", "%5c"
  // - null bytes: "%00", "\0"
  const lowerUrl = requestUrl.toLowerCase();
  if (
    lowerUrl.includes("..") ||
    lowerUrl.includes("%2e%2e") ||
    lowerUrl.includes("%2e.") ||
    lowerUrl.includes(".%2e") ||
    lowerUrl.includes("%2f") ||
    lowerUrl.includes("%5c") ||
    lowerUrl.includes("%00") ||
    requestUrl.includes("\0")
  ) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Traversal or dangerous character sequence detected in URL"
    };
  }

  // 4. Iterative decoding loop (up to 10 passes) to catch multi-level/nested percent-encoding evasion
  // and validate against malformed percent encodings (e.g. %ZZ, %E0%A4%A)
  let testDecoded = requestUrl;
  let previous = "";
  let passes = 0;
  while (testDecoded !== previous && passes < 10) {
    previous = testDecoded;
    passes++;
    try {
      testDecoded = decodeURIComponent(testDecoded);
    } catch {
      return {
        status: "rejected",
        httpStatus: 400,
        error: "Malformed URL encoding"
      };
    }
    const norm = testDecoded.replace(/\\/g, "/");
    if (norm.includes("..") || /(?:^|\/)\.\.(?:\/|$)/.test(norm)) {
      return {
        status: "rejected",
        httpStatus: 400,
        error: "Decoded traversal pattern detected"
      };
    }
  }

  // 5. Parse URL structure
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Failed to parse artwork URL"
    };
  }

  // 6. Check for live media artwork request
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;
  if (
    host === "live-artwork" ||
    host === "current-art" ||
    pathname === "/live-artwork" ||
    pathname === "/current-art"
  ) {
    if (
      pathname !== "" &&
      pathname !== "/" &&
      pathname !== "/live-artwork" &&
      pathname !== "/current-art"
    ) {
      return {
        status: "rejected",
        httpStatus: 400,
        error: "Invalid live artwork path specification"
      };
    }
    return { status: "valid_live" };
  }

  // 7. Extract requested static artwork candidate
  let rawCandidate = "";
  if (pathname && pathname !== "/") {
    rawCandidate = pathname.replace(/^\/+/, "");
  } else if (parsed.hostname) {
    rawCandidate = parsed.hostname;
  }

  if (!rawCandidate || rawCandidate === "." || rawCandidate === "/") {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Empty artwork identifier"
    };
  }

  let decodedCandidate: string;
  try {
    decodedCandidate = decodeURIComponent(rawCandidate);
  } catch {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Malformed artwork candidate URI encoding"
    };
  }

  // 8. Reject absolute paths & root-relative paths
  if (
    path.isAbsolute(decodedCandidate) ||
    /^[a-zA-Z]:[/\\/]/.test(decodedCandidate) ||
    decodedCandidate.startsWith("/") ||
    decodedCandidate.startsWith("\\")
  ) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Absolute artwork paths are forbidden"
    };
  }

  // 9. Resolve using path.resolve against artwork assets directory
  const resolvedBase = path.resolve(artworkDir);
  const resolvedPath = path.resolve(resolvedBase, decodedCandidate);

  // 10. Verify that the resolved path is lexically contained strictly inside resolvedBase
  const relative = path.relative(resolvedBase, resolvedPath);
  const isContained =
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    relative !== "" &&
    resolvedPath.toLowerCase().startsWith(resolvedBase.toLowerCase() + path.sep);

  if (!isContained) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: "Path escapes artwork directory"
    };
  }

  // 11. Check allowed file extension
  const ext = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_ARTWORK_EXTENSIONS.has(ext)) {
    return {
      status: "rejected",
      httpStatus: 400,
      error: `Unsupported artwork extension: ${ext || "none"}`
    };
  }

  // 12. Symlink protection & regular file verification:
  // If the filesystem entry exists, ensure its real path stays strictly within the real artwork directory
  // and that the entry is a regular file, not a directory or an external symlink target.
  const lstat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
  if (lstat) {
    // If the path points directly to a directory (even one ending in .svg), reject it
    if (lstat.isDirectory()) {
      return {
        status: "rejected",
        httpStatus: 400,
        error: "Artwork target is a directory, not a regular file"
      };
    }

    // Resolve the real filesystem path of the base directory and candidate file
    let realBase: string;
    try {
      realBase = fs.realpathSync(resolvedBase);
    } catch {
      realBase = resolvedBase;
    }

    let realTarget: string;
    try {
      realTarget = fs.realpathSync(resolvedPath);
    } catch {
      return {
        status: "rejected",
        httpStatus: 404,
        error: "Artwork target not found"
      };
    }

    // Verify real target is inside real base directory
    const realRelative = path.relative(realBase, realTarget);
    const isRealContained =
      !realRelative.startsWith("..") &&
      !path.isAbsolute(realRelative) &&
      realRelative !== "" &&
      realTarget.toLowerCase().startsWith(realBase.toLowerCase() + path.sep);

    if (!isRealContained) {
      return {
        status: "rejected",
        httpStatus: 403,
        error: "Symlink escapes artwork directory"
      };
    }

    // Ensure real target is a regular file
    let realStat: fs.Stats;
    try {
      realStat = fs.statSync(realTarget);
    } catch {
      return {
        status: "rejected",
        httpStatus: 404,
        error: "Artwork target stat failed"
      };
    }

    if (!realStat.isFile()) {
      return {
        status: "rejected",
        httpStatus: 400,
        error: "Artwork target is not a regular file"
      };
    }

    // Ensure real target extension is also allowed
    const realExt = path.extname(realTarget).toLowerCase();
    if (!ALLOWED_ARTWORK_EXTENSIONS.has(realExt)) {
      return {
        status: "rejected",
        httpStatus: 400,
        error: `Unsupported target extension: ${realExt || "none"}`
      };
    }

    return {
      status: "valid_static",
      filePath: realTarget,
      mimeType: EXTENSION_MIME_MAP[realExt] || "image/png"
    };
  }

  const mimeType = EXTENSION_MIME_MAP[ext] || "image/png";

  return {
    status: "valid_static",
    filePath: resolvedPath,
    mimeType
  };
}
