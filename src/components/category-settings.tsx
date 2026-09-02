"use client";

import { useState } from "react";
import { Plus, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryOption } from "@/lib/categories";

type EditableCategory = CategoryOption & { key: string };

type Props = {
  categories: CategoryOption[];
  pending: boolean;
  onSave: (categories: CategoryOption[]) => void;
};

export function CategorySettings({ categories, pending, onSave }: Props) {
  const [items, setItems] = useState<EditableCategory[]>(() =>
    categories.map((category, index) => ({ ...category, ideas: [...category.ideas], key: `saved-${index}` })),
  );
  const [newCategory, setNewCategory] = useState("");
  const [ideaDrafts, setIdeaDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function updateCategory(key: string, update: Partial<CategoryOption>) {
    setItems((current) => current.map((category) => category.key === key ? { ...category, ...update } : category));
    setError("");
  }

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (items.length >= 20) return setError("You can have up to 20 categories.");
    if (items.some((category) => category.name.trim().toLowerCase() === name.toLowerCase())) {
      return setError("Category names must be unique.");
    }
    setItems((current) => [...current, { key: crypto.randomUUID(), name, ideas: [] }]);
    setNewCategory("");
    setError("");
  }

  function removeCategory(key: string) {
    if (items.length === 1) return setError("Keep at least one category.");
    setItems((current) => current.filter((category) => category.key !== key));
    setIdeaDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setError("");
  }

  function addIdea(category: EditableCategory) {
    const idea = (ideaDrafts[category.key] ?? "").trim();
    if (!idea) return;
    if (category.ideas.length >= 12) return setError("Each category can have up to 12 quick picks.");
    if (category.ideas.some((current) => current.toLowerCase() === idea.toLowerCase())) {
      return setError("Quick picks must be unique within a category.");
    }
    updateCategory(category.key, { ideas: [...category.ideas, idea] });
    setIdeaDrafts((current) => ({ ...current, [category.key]: "" }));
  }

  function save() {
    const next = items.map(({ name, ideas }) => ({
      name: name.trim(),
      ideas: ideas.map((idea) => idea.trim()).filter(Boolean),
    }));
    if (next.some((category) => !category.name)) return setError("Every category needs a name.");
    const names = next.map((category) => category.name.toLowerCase());
    if (new Set(names).size !== names.length) return setError("Category names must be unique.");
    setError("");
    onSave(next);
  }

  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
          <Tag className="size-4" />
        </span>
        <div>
          <h3 className="font-semibold">Categories &amp; quick picks</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Quick picks appear below the item name when their category is selected.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((category) => (
          <div key={category.key} className="rounded-2xl border border-border bg-secondary/25 p-3.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Category name"
                value={category.name}
                maxLength={30}
                onChange={(event) => updateCategory(category.key, { name: event.target.value })}
                className="h-10 bg-card font-semibold"
              />
              <button
                type="button"
                aria-label={`Delete ${category.name || "category"}`}
                title={items.length === 1 ? "Keep at least one category" : "Delete category"}
                disabled={items.length === 1}
                onClick={() => removeCategory(category.key)}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {category.ideas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {category.ideas.map((idea) => (
                  <span key={idea} className="flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-xs font-semibold">
                    {idea}
                    <button
                      type="button"
                      aria-label={`Remove ${idea}`}
                      onClick={() => updateCategory(category.key, { ideas: category.ideas.filter((current) => current !== idea) })}
                      className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Input
                aria-label={`Add quick pick to ${category.name}`}
                value={ideaDrafts[category.key] ?? ""}
                maxLength={40}
                placeholder="Add quick pick"
                onChange={(event) => setIdeaDrafts((current) => ({ ...current, [category.key]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addIdea(category);
                  }
                }}
                className="h-9 bg-card text-sm"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={`Add quick pick to ${category.name}`}
                disabled={!ideaDrafts[category.key]?.trim() || category.ideas.length >= 12}
                onClick={() => addIdea(category)}
                className="size-9 shrink-0 bg-card"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={newCategory}
          maxLength={30}
          placeholder="New category"
          onChange={(event) => { setNewCategory(event.target.value); setError(""); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCategory();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={!newCategory.trim() || items.length >= 20} onClick={addCategory}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <Button type="button" disabled={pending} onClick={save} className="mt-4 w-full">
        Save categories
      </Button>
    </section>
  );
}
