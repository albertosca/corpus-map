/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import page from "./index.html?raw";

describe("demo page head", () => {
  it("carries a meta description, the one SEO audit Lighthouse failed on the demo (2026-10-23)", () => {
    const document = new DOMParser().parseFromString(page, "text/html");
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(description.length).toBeGreaterThan(50);
  });

  it("declares an inline icon, so the browser never requests a missing /favicon.ico (a 404 in the console)", () => {
    const document = new DOMParser().parseFromString(page, "text/html");
    expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toMatch(/^data:/);
  });
});
