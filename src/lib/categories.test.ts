import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CATEGORIES, normalizeCategories } from "./categories";

describe("normalizeCategories", () => {
  it("uses fresh defaults when no household preference exists", () => {
    const first = normalizeCategories(null);
    first[0].ideas.push("Changed");
    assert.deepEqual(normalizeCategories(null), DEFAULT_CATEGORIES);
  });

  it("keeps valid custom categories and trims their quick picks", () => {
    assert.deepEqual(
      normalizeCategories([{ name: " Pets ", ideas: [" Food ", "Vet", 42] }]),
      [{ name: "Pets", ideas: ["Food", "Vet"] }],
    );
  });

  it("falls back when stored data is malformed", () => {
    assert.deepEqual(normalizeCategories([{ nope: true }]), DEFAULT_CATEGORIES);
  });
});
