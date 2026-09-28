import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoriesIncluding, DEFAULT_CATEGORIES, normalizeCategories } from "./categories";

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

describe("categoriesIncluding", () => {
  const configured = [{ name: "Food", ideas: ["Lunch"] }, { name: "Bills", ideas: [] }];

  it("returns the configured list untouched when the category is still offered", () => {
    assert.equal(categoriesIncluding(configured, "Bills"), configured);
  });

  it("returns the configured list untouched when there is no current category", () => {
    assert.equal(categoriesIncluding(configured), configured);
  });

  it("appends a removed category without quick picks, leaving the input alone", () => {
    assert.deepEqual(categoriesIncluding(configured, "Pets"), [...configured, { name: "Pets", ideas: [] }]);
    assert.equal(configured.length, 2);
  });
});
