"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Category } from "@/lib/database.types";

const COLORS = [
  "#1A1C1E", "#6C7278", "#B8422E", "#3F6B4E", "#A86E2A",
  "#3A4F66", "#8C5A3C", "#4F4A45", "#7A8C7E", "#5C2E1F",
  "#94704A", "#2E3B4E", "#6B5944", "#3F4A3F", "#A89683",
];

export default function CategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: "expense" as Category["type"],
    icon: "",
    color: COLORS[2],
  });

  async function loadCategories() {
    setLoading(true);
    setPageError("");

    const { data, error } = await supabase.from("categories").select("*").order("type").order("name");

    if (error) {
      setCategories([]);
      setPageError(error.message);
      setLoading(false);
      return;
    }

    if (data) setCategories(data);
    setLoading(false);
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  function openCreate() {
    setEditing(null);
    setFormError("");
    setForm({ name: "", type: "expense", icon: "", color: COLORS[2] });
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setFormError("");
    setForm({ name: cat.name, type: cat.type, icon: cat.icon ?? "", color: cat.color });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setFormError("Sign in again before editing categories.");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload = {
      name: form.name.trim(),
      type: form.type,
      icon: form.icon.trim() || null,
      color: form.color,
    };

    if (!payload.name) {
      setFormError("Name is required.");
      setSaving(false);
      return;
    }

    try {
      if (editing?.user_id === null) {
        const { data: createdCategory, error: insertError } = await supabase
          .from("categories")
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        const { error: reassignError } = await supabase
          .from("transactions")
          .update({ category_id: createdCategory.id })
          .eq("category_id", editing.id)
          .eq("user_id", user.id);

        if (reassignError) {
          throw reassignError;
        }
      } else if (editing) {
        const { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", editing.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("categories").insert({
          ...payload,
          user_id: user.id,
        });

        if (error) {
          throw error;
        }
      }

      setModalOpen(false);
      setEditing(null);
      await loadCategories();
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        setFormError("You already have a category with that name.");
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError("The category could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this category?")) return;

    const category = categories.find((item) => item.id === id);

    if (category?.user_id === null) {
      setPageError("Shared default categories cannot be deleted.");
      return;
    }

    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) {
      setPageError(error.message);
      return;
    }

    await loadCategories();
  }

  const grouped = {
    income: categories.filter((c) => c.type === "income"),
    expense: categories.filter((c) => c.type === "expense"),
    transfer: categories.filter((c) => c.type === "transfer"),
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-tertiary)] border-t-transparent"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-caps">Taxonomy</p>
          <h1 className="page-title mt-1">
            Categories
          </h1>
        </div>
        <button onClick={openCreate} className="btn btn-primary w-full sm:w-auto">
          <Plus size={16} aria-hidden />
          Add Category
        </button>
      </div>

      {pageError && <div className="notice notice-danger">{pageError}</div>}

      {(["income", "expense", "transfer"] as const).map((type) => (
        <section key={type}>
          <h2 className="label-caps mb-3">
            {type} ({grouped[type].length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {grouped[type].map((cat) => (
              <Card key={cat.id} className="py-3 pl-4 pr-2 sm:py-3 sm:pl-4 sm:pr-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="h-4 w-4 flex-none rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--color-primary)]">
                        {cat.name}
                      </span>
                      {cat.user_id === null && (
                        <p className="text-xs text-[var(--color-secondary)]">Default category</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-none gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      aria-label={`Edit category ${cat.name}`}
                      className="btn btn-ghost btn-icon"
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      aria-label={`Delete category ${cat.name}`}
                      className="btn btn-ghost btn-icon hover:text-[var(--color-danger)]"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Category" : "New Category"}>
        <form onSubmit={handleSave} className="space-y-4">
          {editing?.user_id === null && (
            <div className="notice notice-warning">
              This is a shared default category. Saving will create your own copy and reassign
              your transactions that use this category.
            </div>
          )}

          {formError && <div className="notice notice-danger">{formError}</div>}

          <div>
            <label className="field-label">
              Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as Category["type"] })}
              className="field"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <p className="field-label">
              Color
            </p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  aria-pressed={form.color === c}
                  className="swatch"
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
