import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, X, ArrowLeft, Trash2, Pencil, Package, MapPin, Tag } from "lucide-react";

const SUPABASE_URL = "https://tsnygejdfqjeyzkcmicd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzbnlnZWpkZnFqZXl6a2NtaWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzQzNjMsImV4cCI6MjA5NzE1MDM2M30.uzQ8aZ5hBXUAjLE9uE2q8NJ_7aGny2bDgh3-tqL9v4Q";

const REST_URL = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function dbFetch(path, options = {}) {
  const res = await fetch(`${REST_URL}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  getBins: () => dbFetch("/bins?select=*&order=name"),
  getItems: () => dbFetch("/items?select=*"),
  insertBin: (bin) => dbFetch("/bins", { method: "POST", body: JSON.stringify(bin) }),
  updateBin: (id, patch) =>
    dbFetch(`/bins?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteBin: (id) => dbFetch(`/bins?id=eq.${id}`, { method: "DELETE" }),
  insertItem: (item) => dbFetch("/items", { method: "POST", body: JSON.stringify(item) }),
  updateItem: (id, patch) =>
    dbFetch(`/items?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteItem: (id) => dbFetch(`/items?id=eq.${id}`, { method: "DELETE" }),
  updateItemsBulk: (ids, patch) =>
    ids.length
      ? dbFetch(`/items?id=in.(${ids.join(",")})`, { method: "PATCH", body: JSON.stringify(patch) })
      : Promise.resolve(null),
};

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function GarageInventory() {
  const [bins, setBins] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home"); // 'home' | 'bin'
  const [activeBinId, setActiveBinId] = useState(null);
  const [query, setQuery] = useState("");
  const [showBinModal, setShowBinModal] = useState(false);
  const [editingBin, setEditingBin] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [loadError, setLoadError] = useState(null);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const [binsData, itemsData] = await Promise.all([db.getBins(), db.getItems()]);
        setBins(
          (binsData || []).map((b) => ({
            id: b.id,
            name: b.name,
            location: b.location || "",
            lastAudited: b.last_audited || null,
          }))
        );
        setItems(
          (itemsData || []).map((i) => ({
            id: i.id,
            binId: i.bin_id,
            name: i.name,
            qty: i.qty || "",
            notes: i.notes || "",
            status: i.status || "ok",
          }))
        );
      } catch (e) {
        setLoadError(e.message);
      }
      setLoaded(true);
    })();
  }, []);

  // Deep-link via ?bin=ID (simulates NFC tap)
  useEffect(() => {
    if (!loaded) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const binParam = params.get("bin");
      if (binParam && bins.find((b) => b.id === binParam)) {
        setActiveBinId(binParam);
        setView("bin");
      }
    } catch (e) {}
  }, [loaded, bins]);

  // Keep the address bar in sync with the current view, so the URL can be
  // copied straight from the browser and written to an NFC tag.
  useEffect(() => {
    if (!loaded) return;
    try {
      const url = new URL(window.location.href);
      if (view === "bin" && activeBinId) {
        url.searchParams.set("bin", activeBinId);
      } else {
        url.searchParams.delete("bin");
      }
      window.history.replaceState(null, "", url.toString());
    } catch (e) {}
  }, [loaded, view, activeBinId]);

  // Note: persistence now happens directly in each save/delete function below,
  // since each one writes straight to Supabase.

  const activeBin = bins.find((b) => b.id === activeBinId);
  const activeBinItems = items.filter((i) => i.binId === activeBinId);

  const filteredBins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bins;
    const matchingBinIds = new Set(
      items.filter((i) => i.name.toLowerCase().includes(q)).map((i) => i.binId)
    );
    return bins.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.location || "").toLowerCase().includes(q) ||
        matchingBinIds.has(b.id)
    );
  }, [bins, items, query]);

  async function saveBin(data) {
    try {
      if (data.id) {
        await db.updateBin(data.id, { name: data.name, location: data.location });
        setBins((prev) => prev.map((b) => (b.id === data.id ? { ...b, ...data } : b)));
      } else {
        const newBin = { id: uid(), name: data.name, location: data.location };
        await db.insertBin(newBin);
        setBins((prev) => [...prev, newBin]);
      }
      setShowBinModal(false);
      setEditingBin(null);
    } catch (e) {
      alert("Couldn't save bin: " + e.message);
    }
  }

  async function deleteBin(id) {
    try {
      await db.deleteBin(id); // items cascade-delete in the database
      setBins((prev) => prev.filter((b) => b.id !== id));
      setItems((prev) => prev.filter((i) => i.binId !== id));
      if (activeBinId === id) {
        setView("home");
        setActiveBinId(null);
      }
    } catch (e) {
      alert("Couldn't delete bin: " + e.message);
    }
  }

  async function saveItem(data) {
    try {
      if (data.id) {
        await db.updateItem(data.id, { name: data.name, qty: data.qty, notes: data.notes });
        setItems((prev) => prev.map((i) => (i.id === data.id ? { ...i, ...data } : i)));
      } else {
        const newItem = {
          id: uid(),
          bin_id: activeBinId,
          name: data.name,
          qty: data.qty,
          notes: data.notes,
          status: "ok",
        };
        await db.insertItem(newItem);
        setItems((prev) => [
          ...prev,
          {
            id: newItem.id,
            binId: activeBinId,
            name: data.name,
            qty: data.qty,
            notes: data.notes,
            status: "ok",
          },
        ]);
      }
      setShowItemModal(false);
      setEditingItem(null);
    } catch (e) {
      alert("Couldn't save item: " + e.message);
    }
  }

  async function deleteItem(id) {
    try {
      await db.deleteItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert("Couldn't delete item: " + e.message);
    }
  }

  // Audit: confirmedIds are items the user checked off during this session.
  // Anything in the bin not in that set gets marked missing; confirmed items
  // get marked ok. The bin's last_audited timestamp is stamped to now.
  async function finishAudit(binId, confirmedIds) {
    const binItemIds = items.filter((i) => i.binId === binId).map((i) => i.id);
    const missingIds = binItemIds.filter((id) => !confirmedIds.includes(id));
    const now = new Date().toISOString();
    try {
      await Promise.all([
        db.updateItemsBulk(confirmedIds, { status: "ok" }),
        db.updateItemsBulk(missingIds, { status: "missing" }),
        db.updateBin(binId, { last_audited: now }),
      ]);
      setItems((prev) =>
        prev.map((i) => {
          if (i.binId !== binId) return i;
          return { ...i, status: confirmedIds.includes(i.id) ? "ok" : "missing" };
        })
      );
      setBins((prev) => prev.map((b) => (b.id === binId ? { ...b, lastAudited: now } : b)));
    } catch (e) {
      alert("Couldn't save audit: " + e.message);
    }
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#17171A", color: "#EDE9E1", fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <style>{FONT_IMPORT}</style>

      {!loaded && (
        <div className="flex items-center justify-center h-screen text-sm" style={{ color: "#8A8580" }}>
          Loading inventory...
        </div>
      )}

      {loaded && loadError && (
        <div className="max-w-md mx-auto px-5 pt-20 text-center text-sm" style={{ color: "#E8590C" }}>
          Couldn't connect to the database.
          <div className="mt-2 text-xs" style={{ color: "#8A8580" }}>{loadError}</div>
        </div>
      )}

      {loaded && !loadError && view === "home" && (
        <Home
          bins={filteredBins}
          items={items}
          query={query}
          setQuery={setQuery}
          onOpenBin={(id) => {
            setActiveBinId(id);
            setView("bin");
          }}
          onNewBin={() => {
            setEditingBin(null);
            setShowBinModal(true);
          }}
        />
      )}

      {loaded && !loadError && view === "bin" && activeBin && (
        <BinDetail
          bin={activeBin}
          binItems={activeBinItems}
          onBack={() => {
            setView("home");
            setActiveBinId(null);
          }}
          onEditBin={() => {
            setEditingBin(activeBin);
            setShowBinModal(true);
          }}
          onDeleteBin={() => deleteBin(activeBin.id)}
          onNewItem={() => {
            setEditingItem(null);
            setShowItemModal(true);
          }}
          onEditItem={(item) => {
            setEditingItem(item);
            setShowItemModal(true);
          }}
          onDeleteItem={deleteItem}
          onFinishAudit={(confirmedIds) => finishAudit(activeBin.id, confirmedIds)}
        />
      )}

      {showBinModal && (
        <BinModal
          bin={editingBin}
          onSave={saveBin}
          onClose={() => {
            setShowBinModal(false);
            setEditingBin(null);
          }}
        />
      )}

      {showItemModal && (
        <ItemModal
          item={editingItem}
          onSave={saveItem}
          onClose={() => {
            setShowItemModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function Home({ bins, items, query, setQuery, onOpenBin, onNewBin }) {
  return (
    <div className="max-w-3xl mx-auto px-5 pt-10 pb-24">
      <div className="mb-8">
        <div
          className="text-xs tracking-[0.3em] mb-1"
          style={{ color: "#E8590C", fontFamily: "'Oswald', sans-serif" }}
        >
          SHOP &middot; INVENTORY
        </div>
        <h1
          className="text-4xl sm:text-5xl tracking-tight"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: "0.02em" }}
        >
          GARAGE LOG
        </h1>
      </div>

      <div className="relative mb-7">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "#807C73" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bins or parts..."
          className="w-full pl-10 pr-4 py-3 rounded-md outline-none text-sm"
          style={{
            background: "#222226",
            border: "1px solid #3A3A3F",
            color: "#EDE9E1",
          }}
        />
      </div>

      {bins.length === 0 && (
        <div
          className="rounded-md border border-dashed py-14 text-center"
          style={{ borderColor: "#3A3A3F", color: "#8A8580" }}
        >
          <Package size={28} className="mx-auto mb-3" style={{ color: "#5A564F" }} />
          <p className="text-sm">No bins yet.</p>
          <p className="text-xs mt-1">Add one and stick an NFC tag to it.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bins.map((bin) => {
          const binItems = items.filter((i) => i.binId === bin.id);
          const missingCount = binItems.filter((i) => i.status === "missing").length;
          return (
            <BinTag
              key={bin.id}
              bin={bin}
              itemCount={binItems.length}
              missingCount={missingCount}
              onClick={() => onOpenBin(bin.id)}
            />
          );
        })}
      </div>

      <button
        onClick={onNewBin}
        className="fixed bottom-6 right-6 rounded-full p-4 shadow-lg flex items-center justify-center"
        style={{ background: "#E8590C", color: "#17171A" }}
        aria-label="Add bin"
      >
        <Plus size={22} />
      </button>
    </div>
  );
}

function formatAuditDate(iso) {
  if (!iso) return "Never audited";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Audited today";
  if (diffDays === 1) return "Audited yesterday";
  if (diffDays < 30) return `Audited ${diffDays}d ago`;
  return `Audited ${d.toLocaleDateString()}`;
}

function BinTag({ bin, itemCount, missingCount, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative text-left rounded-md p-4 pl-6 transition-transform hover:-translate-y-0.5"
      style={{
        background: "#F2EBDB",
        color: "#2B2823",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      {/* punch hole */}
      <div
        className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full"
        style={{ background: "#17171A", border: "2px solid #17171A" }}
      />
      <div
        className="absolute left-0 top-0 bottom-0 w-px"
        style={{
          background:
            "repeating-linear-gradient(to bottom, #C9BFA6 0, #C9BFA6 4px, transparent 4px, transparent 8px)",
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-lg leading-tight"
          style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, letterSpacing: "0.02em" }}
        >
          {bin.name.toUpperCase()}
        </h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
          style={{ background: "#E8590C", color: "#F2EBDB", fontFamily: "'Oswald', sans-serif" }}
        >
          {itemCount} ITEM{itemCount === 1 ? "" : "S"}
        </span>
      </div>
      {bin.location && (
        <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: "#6B6862" }}>
          <MapPin size={12} />
          {bin.location}
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] tracking-widest" style={{ color: "#A39C8A" }}>
          TAG #{bin.id.toUpperCase()}
        </span>
        {missingCount > 0 ? (
          <span className="text-[10px]" style={{ color: "#B0432B" }}>
            {missingCount} missing
          </span>
        ) : (
          <span className="text-[10px]" style={{ color: "#8A8580" }}>
            {formatAuditDate(bin.lastAudited)}
          </span>
        )}
      </div>
    </button>
  );
}

function BinDetail({
  bin,
  binItems,
  onBack,
  onEditBin,
  onDeleteBin,
  onNewItem,
  onEditItem,
  onDeleteItem,
  onFinishAudit,
}) {
  const [copied, setCopied] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [confirmed, setConfirmed] = useState(new Set());

  function startAudit() {
    setConfirmed(new Set());
    setAuditing(true);
  }

  function toggleConfirmed(id) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFinish() {
    onFinishAudit(Array.from(confirmed));
    setAuditing(false);
  }

  // If a new item appears while auditing (user added one mid-audit), treat
  // it as automatically confirmed since adding it is itself a confirmation.
  const prevItemIdsRef = useRef(new Set(binItems.map((i) => i.id)));
  useEffect(() => {
    if (auditing) {
      const currentIds = new Set(binItems.map((i) => i.id));
      const newIds = [...currentIds].filter((id) => !prevItemIdsRef.current.has(id));
      if (newIds.length) {
        setConfirmed((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          return next;
        });
      }
    }
    prevItemIdsRef.current = new Set(binItems.map((i) => i.id));
  }, [binItems, auditing]);

  const missingCount = binItems.filter((i) => i.status === "missing").length;

  return (
    <div className="max-w-3xl mx-auto px-5 pt-8 pb-24">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-6"
        style={{ color: "#A39C8A" }}
      >
        <ArrowLeft size={16} />
        All bins
      </button>

      <div
        className="relative rounded-md p-5 pl-7 mb-6"
        style={{ background: "#F2EBDB", color: "#2B2823" }}
      >
        <div
          className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full"
          style={{ background: "#17171A", border: "2px solid #17171A" }}
        />
        <div
          className="absolute left-0 top-0 bottom-0 w-px"
          style={{
            background:
              "repeating-linear-gradient(to bottom, #C9BFA6 0, #C9BFA6 4px, transparent 4px, transparent 8px)",
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-2xl"
              style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: "0.02em" }}
            >
              {bin.name.toUpperCase()}
            </h2>
            {bin.location && (
              <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: "#6B6862" }}>
                <MapPin size={12} />
                {bin.location}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] tracking-widest" style={{ color: "#A39C8A" }}>
                TAG #{bin.id.toUpperCase()}
              </span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (e) {}
                }}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "#E8590C", color: "#F2EBDB" }}
              >
                {copied ? "Copied!" : "Copy tag URL"}
              </button>
            </div>
            <div className="text-[10px] mt-1" style={{ color: "#6B6862" }}>
              {formatAuditDate(bin.lastAudited)}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onEditBin} aria-label="Edit bin" style={{ color: "#6B6862" }}>
              <Pencil size={16} />
            </button>
            <button onClick={onDeleteBin} aria-label="Delete bin" style={{ color: "#B0432B" }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {missingCount > 0 && !auditing && (
        <div
          className="rounded-md px-4 py-2.5 mb-4 text-xs"
          style={{ background: "rgba(176,67,43,0.15)", border: "1px solid #B0432B", color: "#E8A491" }}
        >
          {missingCount} item{missingCount === 1 ? "" : "s"} flagged missing since last audit
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs tracking-[0.25em]" style={{ color: "#E8590C", fontFamily: "'Oswald', sans-serif" }}>
          {auditing ? "AUDITING" : "CONTENTS"}
        </h3>
        <div className="flex gap-2">
          {!auditing && binItems.length > 0 && (
            <button
              onClick={startAudit}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded"
              style={{ background: "#E8590C", color: "#17171A" }}
            >
              Start audit
            </button>
          )}
          {!auditing && (
            <button
              onClick={onNewItem}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded"
              style={{ background: "#222226", border: "1px solid #3A3A3F", color: "#EDE9E1" }}
            >
              <Plus size={14} />
              Add item
            </button>
          )}
        </div>
      </div>

      {binItems.length === 0 && (
        <div
          className="rounded-md border border-dashed py-10 text-center text-sm"
          style={{ borderColor: "#3A3A3F", color: "#8A8580" }}
        >
          Empty bin. Add what's inside.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {binItems.map((item) => {
          const isConfirmed = confirmed.has(item.id);
          const isMissing = !auditing && item.status === "missing";
          return (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-md px-4 py-3"
              style={{
                background: "#222226",
                border: isMissing ? "1px solid #B0432B" : "1px solid #2D2D32",
              }}
            >
              {auditing && (
                <button
                  onClick={() => toggleConfirmed(item.id)}
                  aria-label={isConfirmed ? "Unconfirm item" : "Confirm item present"}
                  className="shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center"
                  style={{
                    background: isConfirmed ? "#E8590C" : "transparent",
                    border: `1px solid ${isConfirmed ? "#E8590C" : "#5A564F"}`,
                  }}
                >
                  {isConfirmed && <span style={{ color: "#17171A", fontSize: "12px" }}>✓</span>}
                </button>
              )}
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm"
                    style={{ color: isMissing ? "#E8A491" : "#EDE9E1" }}
                  >
                    {item.name}
                  </span>
                  {item.qty && (
                    <span className="text-xs" style={{ color: "#E8590C" }}>
                      &times;{item.qty}
                    </span>
                  )}
                  {isMissing && (
                    <span className="text-[10px] px-1 rounded" style={{ background: "#B0432B", color: "#F2EBDB" }}>
                      MISSING
                    </span>
                  )}
                </div>
                {item.notes && (
                  <div className="text-xs mt-1" style={{ color: "#807C73" }}>
                    {item.notes}
                  </div>
                )}
              </div>
              {!auditing && (
                <div className="flex gap-2 shrink-0 pt-0.5">
                  <button onClick={() => onEditItem(item)} aria-label="Edit item" style={{ color: "#6B6862" }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDeleteItem(item.id)} aria-label="Delete item" style={{ color: "#B0432B" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {auditing && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onNewItem}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-2.5 py-2.5 rounded"
            style={{ background: "#222226", border: "1px solid #3A3A3F", color: "#EDE9E1" }}
          >
            <Plus size={14} />
            Add item
          </button>
          <button
            onClick={() => setAuditing(false)}
            className="flex-1 text-xs px-2.5 py-2.5 rounded"
            style={{ background: "#222226", border: "1px solid #3A3A3F", color: "#EDE9E1" }}
          >
            Cancel
          </button>
          <button
            onClick={handleFinish}
            className="flex-1 text-xs px-2.5 py-2.5 rounded font-medium"
            style={{ background: "#E8590C", color: "#17171A" }}
          >
            Finish audit ({confirmed.size}/{binItems.length})
          </button>
        </div>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-5 z-50"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-sm rounded-md p-5"
        style={{ background: "#222226", border: "1px solid #3A3A3F" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-sm tracking-[0.2em]"
            style={{ color: "#E8590C", fontFamily: "'Oswald', sans-serif" }}
          >
            {title}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "#8A8580" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function inputStyle() {
  return {
    background: "#17171A",
    border: "1px solid #3A3A3F",
    color: "#EDE9E1",
  };
}

function BinModal({ bin, onSave, onClose }) {
  const [name, setName] = useState(bin?.name || "");
  const [location, setLocation] = useState(bin?.location || "");

  return (
    <ModalShell title={bin ? "EDIT BIN" : "NEW BIN"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs" style={{ color: "#8A8580" }}>
          Bin name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Plumbing fittings"
            className="w-full mt-1 px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </label>
        <label className="text-xs" style={{ color: "#8A8580" }}>
          Shelf / location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Shelf 2, left wall"
            className="w-full mt-1 px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </label>
        <button
          onClick={() => name.trim() && onSave({ id: bin?.id, name: name.trim(), location: location.trim() })}
          disabled={!name.trim()}
          className="mt-2 py-2.5 rounded text-sm font-medium"
          style={{ background: "#E8590C", color: "#17171A", opacity: name.trim() ? 1 : 0.5 }}
        >
          {bin ? "Save changes" : "Create bin"}
        </button>
      </div>
    </ModalShell>
  );
}

function ItemModal({ item, onSave, onClose }) {
  const [name, setName] = useState(item?.name || "");
  const [qty, setQty] = useState(item?.qty || "");
  const [notes, setNotes] = useState(item?.notes || "");

  return (
    <ModalShell title={item ? "EDIT ITEM" : "ADD ITEM"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-xs" style={{ color: "#8A8580" }}>
          Item name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 1/2 in copper elbows"
            className="w-full mt-1 px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </label>
        <label className="text-xs" style={{ color: "#8A8580" }}>
          Quantity (optional)
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 12"
            className="w-full mt-1 px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </label>
        <label className="text-xs" style={{ color: "#8A8580" }}>
          Notes (optional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. for upstairs bathroom"
            className="w-full mt-1 px-3 py-2 rounded text-sm outline-none"
            style={inputStyle()}
          />
        </label>
        <button
          onClick={() =>
            name.trim() && onSave({ id: item?.id, name: name.trim(), qty: qty.trim(), notes: notes.trim() })
          }
          disabled={!name.trim()}
          className="mt-2 py-2.5 rounded text-sm font-medium"
          style={{ background: "#E8590C", color: "#17171A", opacity: name.trim() ? 1 : 0.5 }}
        >
          {item ? "Save changes" : "Add item"}
        </button>
      </div>
    </ModalShell>
  );
}
