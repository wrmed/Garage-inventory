import React, { useState, useEffect, useMemo } from "react";
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
          (binsData || []).map((b) => ({ id: b.id, name: b.name, location: b.location || "" }))
        );
        setItems(
          (itemsData || []).map((i) => ({
            id: i.id,
            binId: i.bin_id,
            name: i.name,
            qty: i.qty || "",
            notes: i.notes || "",
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
        };
        await db.insertItem(newItem);
        setItems((prev) => [
          ...prev,
          { id: newItem.id, binId: activeBinId, name: data.name, qty: data.qty, notes: data.notes },
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
        {bins.map((bin) => (
          <BinTag key={bin.id} bin={bin} itemCount={items.filter((i) => i.binId === bin.id).length} onClick={() => onOpenBin(bin.id)} />
        ))}
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

function BinTag({ bin, itemCount, onClick }) {
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
      <div className="mt-3 text-[10px] tracking-widest" style={{ color: "#A39C8A" }}>
        TAG #{bin.id.toUpperCase()}
      </div>
    </button>
  );
}

function BinDetail({ bin, binItems, onBack, onEditBin, onDeleteBin, onNewItem, onEditItem, onDeleteItem }) {
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
            <div className="mt-2 text-[10px] tracking-widest" style={{ color: "#A39C8A" }}>
              TAG #{bin.id.toUpperCase()}
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

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs tracking-[0.25em]" style={{ color: "#E8590C", fontFamily: "'Oswald', sans-serif" }}>
          CONTENTS
        </h3>
        <button
          onClick={onNewItem}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded"
          style={{ background: "#222226", border: "1px solid #3A3A3F", color: "#EDE9E1" }}
        >
          <Plus size={14} />
          Add item
        </button>
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
        {binItems.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-md px-4 py-3"
            style={{ background: "#222226", border: "1px solid #2D2D32" }}
          >
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm" style={{ color: "#EDE9E1" }}>
                  {item.name}
                </span>
                {item.qty && (
                  <span className="text-xs" style={{ color: "#E8590C" }}>
                    &times;{item.qty}
                  </span>
                )}
              </div>
              {item.notes && (
                <div className="text-xs mt-1" style={{ color: "#807C73" }}>
                  {item.notes}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 pt-0.5">
              <button onClick={() => onEditItem(item)} aria-label="Edit item" style={{ color: "#6B6862" }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => onDeleteItem(item.id)} aria-label="Delete item" style={{ color: "#B0432B" }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
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
