"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Category } from "@/lib/database.types";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#64748b",
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
    color: "#6366f1",
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
    setForm({ name: "", type: "expense", icon: "", color: "#6366f1" });
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {pageError && (
        <Card>
          <div className="text-sm text-red-700">{pageError}</div>
        </Card>
      )}

      {(["income", "expense", "transfer"] as const).map((type) => (
        <div key={type}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            {type} ({grouped[type].length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[type].map((cat) => (
              <Card key={cat.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                      {cat.user_id === null && (
                        <p className="text-xs text-gray-500">Default category</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Category" : "New Category"}>
        <form onSubmit={handleSave} className="space-y-4">
          {editing?.user_id === null && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This is a shared default category. Saving will create your own copy and reassign
              your transactions that use this category.
            </div>
          )}

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as Category["type"] })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-6 w-6 rounded-full border-2 ${form.color === c ? "border-gray-900" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
