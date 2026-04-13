"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/Card";
import Modal from "@/components/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Label } from "@/lib/database.types";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899", "#64748b",
];

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const [form, setForm] = useState({ name: "", color: "#8b5cf6" });

  async function loadLabels() {
    setLoading(true);
    const { data } = await supabase.from("labels").select("*").order("name");
    if (data) setLabels(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLabels();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", color: "#8b5cf6" });
    setModalOpen(true);
  }

  function openEdit(label: Label) {
    setEditing(label);
    setForm({ name: label.name, color: label.color });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await supabase.from("labels").update({ name: form.name, color: form.color }).eq("id", editing.id);
    } else {
      await supabase.from("labels").insert({ name: form.name, color: form.color });
    }
    setModalOpen(false);
    loadLabels();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this label?")) return;
    await supabase.from("labels").delete().eq("id", id);
    loadLabels();
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Labels</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} />
          Add Label
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((label) => (
          <Card key={label.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="font-medium text-gray-900">{label.name}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(label)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(label.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {labels.length === 0 && (
        <Card>
          <div className="py-12 text-center text-gray-500">No labels yet. Create your first one!</div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Label" : "New Label"}>
        <form onSubmit={handleSave} className="space-y-4">
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
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
