import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseCsp(cspString) {
  const directives = {};
  const tokens = cspString.split(";").map((s) => s.trim()).filter(Boolean);
  for (const token of tokens) {
    const parts = token.split(/\s+/);
    const directiveName = parts[0].toLowerCase();
    const sources = parts.slice(1);
    directives[directiveName] = sources;
  }
  return directives;
}

function extractMetaCsp(htmlContent) {
  const match = htmlContent.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content="([^"]*)"/i);
  if (!match) {
    const fallbackMatch = htmlContent.match(/<meta[^>]+content="([^"]*)"[^>]+http-equiv=["']Content-Security-Policy["']/i);
    return fallbackMatch ? fallbackMatch[1] : null;
  }
  return match[1];
}

describe("Content Security Policy (CSP) Security Suite", () => {
  describe("1. Custom protocol (islet-art) privilege registration", () => {
    test("does not enable bypassCSP for islet-art protocol", () => {
      const mainTsPath = path.join(rootDir, "electron", "main.ts");
      const content = fs.readFileSync(mainTsPath, "utf8");

      assert.ok(!content.includes("bypassCSP: true"), "islet-art must not bypass CSP");
      assert.ok(content.includes('scheme: "islet-art"'), "islet-art scheme registration must be present");
      assert.ok(content.includes("corsEnabled: true"), "islet-art must have CORS enabled");
      assert.ok(content.includes("secure: true"), "islet-art must be marked secure");
      assert.ok(content.includes("standard: true"), "islet-art must be marked standard");
    });
  });

  describe("2. Development CSP configuration in index.html", () => {
    const devHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
    const cspString = extractMetaCsp(devHtml);
    assert.ok(cspString, "index.html must contain a Content-Security-Policy meta tag");
    const directives = parseCsp(cspString);

    test("default-src is strictly restricted to 'self'", () => {
      assert.deepEqual(directives["default-src"], ["'self'"]);
    });

    test("script-src explicitly defined and does not allow wildcard or untrusted remote origins", () => {
      assert.ok(directives["script-src"], "script-src must be explicitly declared");
      assert.ok(directives["script-src"].includes("'self'"));
      assert.ok(!directives["script-src"].includes("data:"));
      assert.ok(!directives["script-src"].includes("https:"));
    });

    test("object-src is set to 'none'", () => {
      assert.deepEqual(directives["object-src"], ["'none'"]);
    });

    test("base-uri is set to 'self'", () => {
      assert.deepEqual(directives["base-uri"], ["'self'"]);
    });

    test("form-action is set to 'none'", () => {
      assert.deepEqual(directives["form-action"], ["'none'"]);
    });

    test("frame-src is set to 'none'", () => {
      assert.deepEqual(directives["frame-src"], ["'none'"]);
    });

    test("img-src whitelists islet-art and blob for artwork and saved shelf images", () => {
      assert.ok(directives["img-src"].includes("islet-art:"));
      assert.ok(directives["img-src"].includes("blob:"));
      assert.ok(directives["img-src"].includes("https:"));
      assert.ok(directives["img-src"].includes("'self'"));
    });

    test("connect-src includes islet-art for media streaming", () => {
      assert.ok(directives["connect-src"].includes("islet-art:"));
      assert.ok(directives["connect-src"].includes("'self'"));
      assert.ok(directives["connect-src"].includes("https:"));
    });
  });

  describe("3. Hardened production CSP in dist/index.html", () => {
    const distHtmlPath = path.join(rootDir, "dist", "index.html");
    if (!fs.existsSync(distHtmlPath)) {
      test.skip("dist/index.html not yet built");
      return;
    }

    const prodHtml = fs.readFileSync(distHtmlPath, "utf8");
    const cspString = extractMetaCsp(prodHtml);
    assert.ok(cspString, "dist/index.html must contain a Content-Security-Policy meta tag");
    const directives = parseCsp(cspString);

    test("production script-src strictly enforces 'self' without unsafe-inline or unsafe-eval", () => {
      assert.ok(directives["script-src"], "script-src must be defined");
      assert.deepEqual(directives["script-src"], ["'self'"], "Production script-src must strictly be 'self'");
    });

    test("production connect-src drops localhost and 127.0.0.1 development ports", () => {
      assert.ok(!directives["connect-src"].includes("http://127.0.0.1:5173"));
      assert.ok(!directives["connect-src"].includes("ws://127.0.0.1:5173"));
      assert.ok(!directives["connect-src"].includes("http://localhost:5173"));
      assert.ok(!directives["connect-src"].includes("ws://localhost:5173"));
      assert.ok(directives["connect-src"].includes("'self'"));
      assert.ok(directives["connect-src"].includes("https:"));
      assert.ok(directives["connect-src"].includes("islet-art:"));
    });

    test("production object-src, base-uri, form-action, and frame-src are strictly locked down", () => {
      assert.deepEqual(directives["object-src"], ["'none'"]);
      assert.deepEqual(directives["base-uri"], ["'self'"]);
      assert.deepEqual(directives["form-action"], ["'none'"]);
      assert.deepEqual(directives["frame-src"], ["'none'"]);
    });
  });
});
