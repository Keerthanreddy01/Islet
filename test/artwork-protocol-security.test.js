import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  resolveArtworkPath,
  ALLOWED_ARTWORK_EXTENSIONS,
  getDefaultArtworkDir
} from "../dist-electron/artwork-protocol.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTWORK_DIR = path.resolve(__dirname, "../assets/artwork");

describe("Custom Artwork Protocol (islet-art://) Security Suite", () => {
  describe("1. Valid artwork requests and media artwork behavior", () => {
    test("resolves existing placeholder.svg via standard scheme", () => {
      const res = resolveArtworkPath("islet-art://placeholder.svg", ARTWORK_DIR);
      assert.equal(res.status, "valid_static");
      if (res.status === "valid_static") {
        assert.equal(res.filePath.toLowerCase(), path.join(ARTWORK_DIR, "placeholder.svg").toLowerCase());
        assert.equal(res.mimeType, "image/svg+xml");
        assert.ok(fs.existsSync(res.filePath), "placeholder.svg must exist on disk");
      }
    });

    test("resolves placeholder.svg with leading triple slash", () => {
      const res = resolveArtworkPath("islet-art:///placeholder.svg", ARTWORK_DIR);
      assert.equal(res.status, "valid_static");
      if (res.status === "valid_static") {
        assert.equal(res.filePath.toLowerCase(), path.join(ARTWORK_DIR, "placeholder.svg").toLowerCase());
        assert.equal(res.mimeType, "image/svg+xml");
      }
    });

    test("resolves artwork when host is artwork", () => {
      const res = resolveArtworkPath("islet-art://artwork/placeholder.svg", ARTWORK_DIR);
      assert.equal(res.status, "valid_static");
      if (res.status === "valid_static") {
        assert.equal(res.filePath.toLowerCase(), path.join(ARTWORK_DIR, "placeholder.svg").toLowerCase());
      }
    });

    test("preserves valid live media artwork requests", () => {
      const res1 = resolveArtworkPath("islet-art://live-artwork?t=1730480000000", ARTWORK_DIR);
      assert.equal(res1.status, "valid_live");

      const res2 = resolveArtworkPath("islet-art:///live-artwork", ARTWORK_DIR);
      assert.equal(res2.status, "valid_live");

      const res3 = resolveArtworkPath("islet-art://current-art?t=123", ARTWORK_DIR);
      assert.equal(res3.status, "valid_live");
    });

    test("recognizes allowed image extensions", () => {
      assert.ok(ALLOWED_ARTWORK_EXTENSIONS.has(".svg"));
      assert.ok(ALLOWED_ARTWORK_EXTENSIONS.has(".png"));
      assert.ok(ALLOWED_ARTWORK_EXTENSIONS.has(".jpg"));
      assert.ok(ALLOWED_ARTWORK_EXTENSIONS.has(".jpeg"));
      assert.ok(ALLOWED_ARTWORK_EXTENSIONS.has(".webp"));
      assert.equal(ALLOWED_ARTWORK_EXTENSIONS.has(".json"), false);
      assert.equal(ALLOWED_ARTWORK_EXTENSIONS.has(".exe"), false);
      assert.equal(ALLOWED_ARTWORK_EXTENSIONS.has(".js"), false);
    });
  });

  describe("2. Directory traversal rejection (../)", () => {
    const traversalUrls = [
      "islet-art://../package.json",
      "islet-art:///../package.json",
      "islet-art:///../../package.json",
      "islet-art:///../../../Windows/win.ini",
      "islet-art:///assets/artwork/../../package.json",
      "islet-art://live-artwork/../package.json",
      "islet-art:///..\\..\\package.json",
      "islet-art://../assets/artwork/placeholder.svg"
    ];

    for (const url of traversalUrls) {
      test(`rejects traversal: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
          assert.ok(res.error.length > 0);
        }
      });
    }
  });

  describe("3. URL-encoded and deep traversal rejection", () => {
    const encodedTraversalUrls = [
      "islet-art://..%2fpackage.json",
      "islet-art:///..%2fpackage.json",
      "islet-art:///%2e%2e/package.json",
      "islet-art:///%2e%2e%2fpackage.json",
      "islet-art:///%2E%2E%2Fpackage.json",
      "islet-art:///%2e%2e%5cpackage.json",
      "islet-art:///..%252fpackage.json",
      "islet-art:///%252e%252e%252fpackage.json",
      "islet-art:///%25252e%25252e%25252fpackage.json",
      "islet-art:///..%25252fpackage.json",
      "islet-art:///%2525252e%2525252e%2525252fpackage.json",
      "islet-art:///placeholder.svg%00.exe",
      "islet-art:///placeholder.svg\0.exe"
    ];

    for (const url of encodedTraversalUrls) {
      test(`rejects encoded traversal: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
          assert.ok(res.error.length > 0);
        }
      });
    }

    const malformedEncodingUrls = [
      "islet-art:///placeholder.svg%ZZ",
      "islet-art:///placeholder.svg%E0%A4%A",
      "islet-art:///placeholder.svg%",
      "islet-art:///placeholder.svg%%%",
      "islet-art:///placeholder.svg%2"
    ];

    for (const url of malformedEncodingUrls) {
      test(`rejects malformed percent encoding: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
          assert.ok(res.error.includes("Malformed URL encoding"));
        }
      });
    }
  });

  describe("4. Absolute paths rejection", () => {
    const absolutePathUrls = [
      "islet-art:///C:/Windows/win.ini",
      "islet-art://C:/Windows/win.ini",
      "islet-art:///C:/Windows/system.svg",
      "islet-art://C:/Windows/system.svg",
      "islet-art:///D:/secret.png",
      "islet-art://D:/secret.png",
      "islet-art:///Windows/win.ini",
      "islet-art:///%5cWindows%5cwin.ini",
      "islet-art:////server/share/art.svg",
      "islet-art:///etc/passwd"
    ];

    for (const url of absolutePathUrls) {
      test(`rejects absolute path: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
          assert.ok(res.error.length > 0);
        }
      });
    }
  });

  describe("5. Unsupported file extensions rejection", () => {
    const unsupportedExtensionUrls = [
      "islet-art:///package.json",
      "islet-art:///package-lock.json",
      "islet-art:///dist-electron/main.js",
      "islet-art:///electron/main.ts",
      "islet-art:///electron/media-worker.ps1",
      "islet-art:///index.html",
      "islet-art:///README.md",
      "islet-art:///placeholder.svg.exe",
      "islet-art:///exploit.bat",
      "islet-art:///placeholder"
    ];

    for (const url of unsupportedExtensionUrls) {
      test(`rejects unsupported extension: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
          assert.ok(res.error.includes("Unsupported artwork extension"));
        }
      });
    }
  });

  describe("6. Empty, malformed, or invalid requests", () => {
    const invalidUrls = [
      "islet-art://",
      "islet-art:///",
      "islet-art://.",
      "http://localhost:5173/placeholder.svg",
      "file:///C:/Windows/win.ini",
      "not-a-valid-url"
    ];

    for (const url of invalidUrls) {
      test(`rejects invalid request: ${url}`, () => {
        const res = resolveArtworkPath(url, ARTWORK_DIR);
        assert.equal(res.status, "rejected");
        if (res.status === "rejected") {
          assert.equal(res.httpStatus, 400);
        }
      });
    }
  });

  describe("7. Symlink protection & filesystem boundary security", () => {
    let tempRoot = "";
    let testArtworkDir = "";
    let externalSecretFile = "";
    let symlinkEscapeFile = "";

    test("setup isolated test environment with external symlink", () => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "islet-art-symlink-test-"));
      testArtworkDir = path.join(tempRoot, "assets", "artwork");
      fs.mkdirSync(testArtworkDir, { recursive: true });

      // Create a secret file outside the artwork directory
      externalSecretFile = path.join(tempRoot, "secret.json");
      fs.writeFileSync(externalSecretFile, JSON.stringify({ secret: "sensitive data" }));

      // Create a symlink inside the artwork directory pointing outside
      symlinkEscapeFile = path.join(testArtworkDir, "symlink-escape.svg");
      try {
        fs.symlinkSync(externalSecretFile, symlinkEscapeFile, "file");
      } catch (err) {
        // If unprivileged on Windows, create a directory junction or fallback test
        assert.fail(`Failed to create test symlink: ${err.message}`);
      }
    });

    test("rejects symlink pointing outside artwork directory with 403 Forbidden", () => {
      const res = resolveArtworkPath("islet-art://symlink-escape.svg", testArtworkDir);
      assert.equal(res.status, "rejected");
      if (res.status === "rejected") {
        assert.equal(res.httpStatus, 403);
        assert.ok(res.error.includes("Symlink escapes artwork directory"));
      }
    });

    test("rejects directories ending with an allowed image extension", () => {
      const fakeDirAsSvg = path.join(testArtworkDir, "fake-folder.svg");
      fs.mkdirSync(fakeDirAsSvg, { recursive: true });

      const res = resolveArtworkPath("islet-art://fake-folder.svg", testArtworkDir);
      assert.equal(res.status, "rejected");
      if (res.status === "rejected") {
        assert.equal(res.httpStatus, 400);
        assert.ok(res.error.includes("directory"));
      }
    });

    test("resolves nested valid artwork paths within artwork directory", () => {
      const nestedDir = path.join(testArtworkDir, "covers", "album");
      fs.mkdirSync(nestedDir, { recursive: true });

      const nestedFile = path.join(nestedDir, "track.png");
      fs.writeFileSync(nestedFile, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic

      const res = resolveArtworkPath("islet-art:///covers/album/track.png", testArtworkDir);
      assert.equal(res.status, "valid_static");
      if (res.status === "valid_static") {
        assert.equal(res.filePath.toLowerCase(), fs.realpathSync(nestedFile).toLowerCase());
        assert.equal(res.mimeType, "image/png");
      }
    });

    test("teardown and clean up temporary test files safely", () => {
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        assert.ok(!fs.existsSync(tempRoot), "Temp test directory should be completely removed");
      }
    });
  });
});
