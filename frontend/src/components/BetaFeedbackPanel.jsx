/**
 * Beta Feedback panel: notepad-style page to submit and view feedback, saved in DB.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { getAuthHeaders } from "../lib/api";

function BetaFeedbackPanel({ apiBase, onClose }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!apiBase || !user) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/beta-feedback`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    const text = (content || "").trim();
    if (!text) {
      toast("Write something to save.");
      return;
    }
    if (!apiBase || !user) {
      toast.error("Sign in to send feedback.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/beta-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Save failed");
      }
      setContent("");
      toast.success("Feedback saved. Thank you.");
      fetchItems();
    } catch (e) {
      toast.error(e.message || "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (createdAt) => {
    if (!createdAt) return "";
    try {
      const d = new Date(createdAt);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return String(createdAt).slice(0, 16);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[#FFFDF7] flex flex-col overflow-hidden"
      data-testid="beta-feedback-panel"
    >
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]/60">
        <h1 className="text-base font-medium text-[#4A5568]">Beta Feedback</h1>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full text-[#718096] hover:bg-[#E2E8F0]/50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-xl mx-auto w-full">
        <p className="text-sm text-[#64748B] mb-4">
          Share bugs, ideas, or anything that would make REFLECT better. Saved to your account.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your feedback here..."
          className="w-full min-h-[160px] p-4 rounded-xl border border-[#E2E8F0] bg-white/60 text-[#4A5568] placeholder-[#94A3B8] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#FFB4A9]/40 focus:border-[#FFB4A9]/40"
          maxLength={10000}
          disabled={saving}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-[#94A3B8]">{content.length} / 10000</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="py-2 px-4 rounded-xl text-sm font-medium text-white bg-[#FFB4A9] hover:bg-[#f5a399] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {items.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[#E2E8F0]/60">
            <h2 className="text-sm font-medium text-[#4A5568] mb-3">Previous feedback</h2>
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="p-3 rounded-xl border border-[#E2E8F0]/60 bg-white/40">
                  <p className="text-sm text-[#4A5568] whitespace-pre-wrap">{item.content}</p>
                  <p className="text-xs text-[#94A3B8] mt-2">{formatDate(item.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="text-xs text-[#94A3B8] mt-6">No feedback saved yet.</p>
        )}
      </div>
    </motion.div>
  );
}

export default BetaFeedbackPanel;
