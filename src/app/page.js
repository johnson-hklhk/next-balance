"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ThemeBtn, SelectBox } from "@/app/common/node";
import Header from "@/app/common/Header";

const STORAGE_KEY = "balanceData"; // legacy single working state (bootstrap only)
const SAVES_KEY = "balanceSaves"; // named snapshots
const TABLES_KEY = "balanceTables"; // { activeTableId, tables: [{ id, name, userData, transactionData }] }

const defaultUserData = [
  { id: "u1", name: "Kalok" },
  { id: "u2", name: "Jason" },
  { id: "u3", name: "Johnson" },
];

const CURRENCIES = ["RMB", "USD", "JPY", "TWD", "KRW", "EUR", "GBP", "THB"];

function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "u" + Math.random().toString(36).slice(2, 9);
}

// default table name = creation date, e.g. "2026-07-12"
function todayName() {
  return new Date().toLocaleDateString("en-CA");
}

// Convert legacy data (string[] users, mixed number/boolean amount array) to the
// new id-based shape. Returns already-new data untouched.
function migrate(raw) {
  if (!raw || typeof raw !== "object") return null;

  let users = Array.isArray(raw.userData) ? raw.userData : [];
  const isLegacyUsers = users.length > 0 && typeof users[0] === "string";
  if (isLegacyUsers) users = users.map((name, i) => ({ id: "u" + (i + 1), name }));

  let txs = Array.isArray(raw.transactionData) ? raw.transactionData : [];
  txs = txs
    .map((tx) => {
      if (!Array.isArray(tx.amount)) return tx; // already new shape
      const payerIdx = tx.amount.findIndex((v) => typeof v === "number" && !isNaN(v));
      if (payerIdx === -1) return null;
      const amount = tx.amount[payerIdx];
      const partnerIdx = [];
      tx.amount.forEach((v, i) => v === true && partnerIdx.push(i));
      // legacy model: payer always shared
      const partners = [payerIdx, ...partnerIdx].map((i) => users[i]?.id).filter(Boolean);
      return { label: tx.label, payer: users[payerIdx]?.id, amount, partners };
    })
    .filter(Boolean)
    .map((tx) => ({ ...tx, id: tx.id || genId() })); // ensure every row has a stable id

  return { userData: users, transactionData: txs };
}

function buildShareUrl(data) {
  const compressed = compressToEncodedURIComponent(JSON.stringify(data));
  return `${window.location.origin}${window.location.pathname}?d=${compressed}`;
}

// Greedy debt simplification: match biggest debtor with biggest creditor until settled.
function computeSettlements(userData, sumData) {
  const round = (n) => Math.round(n * 100) / 100;
  const debtors = [];
  const creditors = [];
  userData.forEach((u, i) => {
    const amt = round(sumData[i] || 0);
    if (amt < -0.005) debtors.push({ name: u.name, amt: -amt });
    else if (amt > 0.005) creditors.push({ name: u.name, amt });
  });
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const result = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const pay = Math.min(debtors[di].amt, creditors[ci].amt);
    result.push({ from: debtors[di].name, to: creditors[ci].name, amount: round(pay) });
    debtors[di].amt -= pay;
    creditors[ci].amt -= pay;
    if (debtors[di].amt < 0.005) di++;
    if (creditors[ci].amt < 0.005) ci++;
  }
  return result;
}

export default function Home() {
  const $head = useRef(null);
  const $body = useRef(null);
  const $user = useRef(null);
  const hydratedRef = useRef(false);
  const [userData, setUserData] = useState(defaultUserData);
  const [transactionData, setTransactionData] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [selectedRow, setSelectedRow] = useState(false);
  const [admin, setAdmin] = useState(true);
  const [saves, setSaves] = useState([]); // [{ name, savedAt, userData, transactionData }]
  const [tables, setTables] = useState([]); // [{ id, name, userData, transactionData }]
  const [activeTableId, setActiveTableId] = useState(null);

  const displayLabel = useMemo(() => transactionData.map(({ label, amount, otherCurrency, currency }) => ({ label, payAmount: amount, otherCurrency, currency })), [transactionData]);

  // per-row balance keyed by user id
  const displayData = useMemo(
    () =>
      transactionData.map(({ payer, amount, partners }) => {
        const balance = {};
        if (!partners || partners.length === 0) {
          balance[payer] = amount;
          return balance;
        }
        const share = amount / partners.length;
        partners.forEach((id) => {
          balance[id] = (balance[id] || 0) - share;
        });
        balance[payer] = (balance[payer] || 0) + amount;
        return balance;
      }),
    [transactionData],
  );

  const sumData = useMemo(() => userData.map((u) => displayData.reduce((acc, bal) => acc + (bal[u.id] || 0), 0)), [displayData, userData]);

  const settlements = useMemo(() => computeSettlements(userData, sumData), [userData, sumData]);

  // Display-only column order: highest balance on the left. Underlying userData /
  // sumData keep their original order (settlements + modals rely on that); we only
  // sort a derived index and remap the rendered columns through it. Stable sort keeps
  // ties in their original position.
  const columnOrder = useMemo(() => userData.map((_, i) => i).sort((a, b) => (sumData[b] || 0) - (sumData[a] || 0)), [userData, sumData]);
  const orderedUserData = useMemo(() => columnOrder.map((i) => userData[i]), [columnOrder, userData]);
  const orderedSumData = useMemo(() => columnOrder.map((i) => sumData[i]), [columnOrder, sumData]);

  const rowIds = useMemo(() => transactionData.map((t) => t.id), [transactionData]);

  const activeTableName = useMemo(() => tables.find((t) => t.id === activeTableId)?.name || "", [tables, activeTableId]);

  // drag starts from the grip handle only; small distance avoids accidental drags on tap
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      setTransactionData((prev) => {
        const oldI = prev.findIndex((t) => t.id === active.id);
        const newI = prev.findIndex((t) => t.id === over.id);
        if (oldI === -1 || newI === -1) return prev;
        return arrayMove(prev, oldI, newI);
      });
    }
    setSelectedRow(false); // index-based selection is stale after reorder
  };

  // bootstrap tables (+ legacy single-dataset migration), share link, saves
  useEffect(() => {
    let tbls = null;
    let activeId = null;
    try {
      const rawT = localStorage.getItem(TABLES_KEY);
      if (rawT) {
        const parsed = JSON.parse(rawT);
        tbls = parsed.tables;
        activeId = parsed.activeTableId;
      }
    } catch {}

    if (!tbls || !tbls.length) {
      // first run: wrap the legacy single dataset (or defaults) as "Table 1"
      let base = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) base = JSON.parse(stored);
      } catch {}
      const m = base ? migrate(base) : null;
      tbls = [
        {
          id: genId(),
          name: todayName(),
          userData: m?.userData?.length ? m.userData : defaultUserData,
          transactionData: m?.transactionData || [],
        },
      ];
      activeId = tbls[0].id;
    }

    // normalise every table's shape (ensure ids / new format)
    tbls = tbls.map((t) => {
      const m = migrate({ userData: t.userData, transactionData: t.transactionData });
      return { ...t, userData: m?.userData?.length ? m.userData : defaultUserData, transactionData: m?.transactionData || [] };
    });

    // a ?d= share link overrides the active table's data
    try {
      const d = new URLSearchParams(window.location.search).get("d");
      if (d) {
        const json = decompressFromEncodedURIComponent(d);
        const m = json && migrate(JSON.parse(json));
        if (m) tbls = tbls.map((t) => (t.id === activeId ? { ...t, userData: m.userData, transactionData: m.transactionData } : t));
      }
    } catch {}

    const active = tbls.find((t) => t.id === activeId) || tbls[0];
    setTables(tbls);
    setActiveTableId(active.id);
    setUserData(active.userData?.length ? active.userData : defaultUserData);
    setTransactionData(active.transactionData || []);

    try {
      const rawSaves = localStorage.getItem(SAVES_KEY);
      if (rawSaves) setSaves(JSON.parse(rawSaves));
    } catch {}
    hydratedRef.current = true;
  }, []);

  // mirror live edits back into the active table
  useEffect(() => {
    if (!hydratedRef.current) return;
    setTables((prev) => prev.map((t) => (t.id === activeTableId ? { ...t, userData, transactionData } : t)));
  }, [userData, transactionData]);

  // persist the whole tables set
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(TABLES_KEY, JSON.stringify({ activeTableId, tables }));
    } catch {}
  }, [tables, activeTableId]);

  useEffect(() => {
    $head.current.style.translate = `${($body.current.scrollLeft || 0) * -1}px 0px`;
    $user.current.style.translate = `0px ${window.scrollY * -1}px`;

    const scrollXHandle = (e) => {
      e && ($head.current.style.translate = `${(e.target.scrollLeft || 0) * -1}px 0px`);
    };
    const scrollYHandle = (e) => {
      $user.current.style.translate = `0px ${window.scrollY * -1}px`;
    };

    $body.current.addEventListener("scroll", scrollXHandle);
    window.addEventListener("scroll", scrollYHandle);
    return () => {
      $body.current.removeEventListener("scroll", scrollXHandle);
      window.removeEventListener("scroll", scrollYHandle);
    };
  }, []);

  const //
    handleRemove = (e) => {
      e && e.preventDefault();
      if (selectedRow !== false) {
        setTransactionData((prev) => prev.filter((_, idx) => idx !== selectedRow));
        setSelectedRow(false);
      }
    },
    handleClear = (e) => {
      e && e.preventDefault();
      if (confirm("Sure to clear ALL records?")) setTransactionData([]);
    },
    handleShare = (e) => {
      e && e.preventDefault();
      try {
        const url = buildShareUrl({ userData, transactionData });
        navigator.clipboard
          .writeText(url)
          .then(() => alert("Share link copied to clipboard!"))
          .catch((err) => alert("Failed to copy link: " + err));
      } catch (err) {
        alert("Share failed: " + err.message);
      }
    };

  const persistSaves = (next) => {
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(next));
    } catch {}
    return next;
  };
  const handleSaveSlot = (name) => {
    const entry = { name, savedAt: Date.now(), userData, transactionData };
    setSaves((prev) => persistSaves([...prev.filter((s) => s.name !== name), entry])); // upsert by name
  };
  const handleLoadSlot = (name) => {
    const entry = saves.find((s) => s.name === name);
    if (!entry) return;
    const migrated = migrate({ userData: entry.userData, transactionData: entry.transactionData });
    if (migrated) {
      if (migrated.userData?.length) setUserData(migrated.userData);
      setTransactionData(migrated.transactionData || []);
    }
    setSelectedRow(false);
    setDialog(false);
  };
  const handleDeleteSlot = (name) => {
    setSaves((prev) => persistSaves(prev.filter((s) => s.name !== name)));
  };

  const loadTableIntoView = (t) => {
    setUserData(t.userData?.length ? t.userData : defaultUserData);
    setTransactionData(t.transactionData || []);
    setSelectedRow(false);
  };
  const handleSwitchTable = (id) => {
    setDialog(false);
    if (id === activeTableId) return;
    const t = tables.find((x) => x.id === id);
    if (!t) return;
    setActiveTableId(id);
    loadTableIntoView(t);
  };
  const handleNewTable = (name) => {
    const t = { id: genId(), name: name || todayName(), userData: defaultUserData, transactionData: [] };
    setTables((prev) => [...prev, t]);
    setActiveTableId(t.id);
    loadTableIntoView(t);
  };
  const handleRenameTable = (id, name) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };
  const handleDeleteTable = (id) => {
    const remaining = tables.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      const fresh = { id: genId(), name: todayName(), userData: defaultUserData, transactionData: [] };
      setTables([fresh]);
      setActiveTableId(fresh.id);
      loadTableIntoView(fresh);
      return;
    }
    setTables(remaining);
    if (id === activeTableId) {
      setActiveTableId(remaining[0].id);
      loadTableIntoView(remaining[0]);
    }
  };

  return (
    <>
      <Header tableName={activeTableName} />

      {admin && (
        <div className="control-nav">
          {!selectedRow ? (
            <>
              <ThemeBtn label="Add" onClick={() => setDialog("add")} />
              <ThemeBtn label="Users" onClick={() => setDialog("user")} />
              <ThemeBtn label="Share" onClick={handleShare} />
              <ThemeBtn label="Settle" onClick={() => setDialog("settle")} />
              <ThemeBtn label="Clear" onClick={handleClear} />
              <div className="control-nav__hr" />
              <ThemeBtn label="Tables" onClick={() => setDialog("data")} />
              <ThemeBtn label="Saves" onClick={() => setDialog("saves")} />
            </>
          ) : (
            <>
              <ThemeBtn label="Edit" onClick={() => setDialog("edit")} />
              <ThemeBtn label="Delete" onClick={handleRemove} />
            </>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="balance-sheet" ref={$body}>
          {["body", "head", "user", "gap"].map((sec) => (
            <table
              key={"table_sec_" + sec}
              className={`table table-striped text-center balance-sheet__sec balance-sheet__${sec}`}
              ref={
                {
                  head: $head,
                  user: $user,
                }[sec] || null
              }
            >
              <thead>
                <tr>
                  {/* The active table's name lives in the fixed header now, so the
                      pinned corner cell labels its own column instead. */}
                  <th style={{ maxWidth: "20vw" }}>Record</th>
                  {orderedUserData.map((u) => (
                    <th key={u.id} style={{ minWidth: "64px", width: `${(100 / orderedUserData.length).toFixed(1)}%` }}>
                      {u.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sec === "user" ? (
                  <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                    {displayData.map((bal, i0) => (
                      <SortableRow key={transactionData[i0].id} id={transactionData[i0].id} selected={selectedRow === i0}>
                        {(handleProps) => <RowCells label={displayLabel[i0].label} payAmount={displayLabel[i0].payAmount} otherCurrency={displayLabel[i0].otherCurrency} currency={displayLabel[i0].currency} bal={bal} userData={orderedUserData} handleProps={handleProps} />}
                      </SortableRow>
                    ))}
                  </SortableContext>
                ) : (
                  displayData.map((bal, i0) => (
                    <tr key={transactionData[i0].id} className={selectedRow === i0 ? "balance-sheet__row--selected" : ""} onClick={sec === "body" ? () => setSelectedRow((prev) => (prev !== i0 ? i0 : false)) : undefined}>
                      <RowCells label={displayLabel[i0].label} payAmount={displayLabel[i0].payAmount} otherCurrency={displayLabel[i0].otherCurrency} currency={displayLabel[i0].currency} bal={bal} userData={orderedUserData} />
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="balance-sheet__total-label">Total</td>
                  {orderedSumData.map((userSum, i) => (
                    <td key={"userSum" + i}>
                      <div className={"balance-sheet__total balance-sheet__total--" + (userSum < 0 ? "neg" : "pos")}>{userSum.toFixed(0)}</div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          ))}
        </div>
      </DndContext>

      <AddRecordModal
        show={dialog == "add" || dialog == "edit"}
        editTx={dialog == "edit" && selectedRow !== false ? transactionData[selectedRow] : null}
        editIndex={selectedRow}
        setDialog={setDialog}
        setTransactionData={setTransactionData}
        userData={userData} //
      />
      <UsersModal
        show={dialog == "user"}
        setDialog={setDialog}
        setUserData={setUserData}
        setTransactionData={setTransactionData}
        userData={userData} //
      />
      <SettleModal
        show={dialog == "settle"}
        setDialog={setDialog}
        settlements={settlements} //
      />
      <SavesModal
        show={dialog == "saves"}
        setDialog={setDialog}
        saves={saves}
        onSave={handleSaveSlot}
        onLoad={handleLoadSlot}
        onDelete={handleDeleteSlot} //
      />
      <DataModal
        show={dialog == "data"}
        setDialog={setDialog}
        tables={tables}
        activeTableId={activeTableId}
        onSwitch={handleSwitchTable}
        onNew={handleNewTable}
        onRename={handleRenameTable}
        onDelete={handleDeleteTable} //
      />
    </>
  );
}

// the th (label) + per-user td cells of one row, shared by every stacked table.
// handleProps (only passed for the interactive `user` table) wires the drag grip.
function RowCells({ label, payAmount, otherCurrency, currency, bal, userData, handleProps }) {
  return (
    <>
      <th style={{ whiteSpace: "nowrap" }}>
        <div className="balance-sheet__label">
          <span className="balance-sheet__grip" {...(handleProps || {})}>
            ⠿
          </span>
          <span>
            {label && (
              <>
                {label}
                {otherCurrency != null && (
                  <sub>
                    {" "}
                    ({currency ? `${currency} ` : ""}
                    {otherCurrency})
                  </sub>
                )}
                <br />
              </>
            )}
            <div className="balance-sheet__amount">${payAmount}</div>
          </span>
        </div>
      </th>
      {userData.map((u) => {
        const item = bal[u.id];
        return (
          <td key={u.id}>
            <div>{typeof item === "number" ? item.toFixed(0) : "-"}</div>
          </td>
        );
      })}
    </>
  );
}

function SortableRow({ id, selected, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 2 } : null),
  };
  const handleProps = { ref: setActivatorNodeRef, ...listeners };
  return (
    <tr ref={setNodeRef} style={style} className={selected ? "balance-sheet__row--selected" : ""} {...attributes}>
      {children(handleProps)}
    </tr>
  );
}

function AddRecordModal({ show, editTx, editIndex, setDialog, setTransactionData, userData }) {
  const isEdit = !!editTx;
  const [payer, setPayer] = useState(userData[0]?.id);
  const [data, setData] = useState({ title: "", amount: "", otherCurrency: "", currency: "RMB" });
  const [partner, setPartner] = useState(userData.map((u) => u.id));

  useMemo(() => {
    if (editTx) {
      setPayer(editTx.payer);
      setPartner(editTx.partners);
      setData({ title: editTx.label || "", amount: String(editTx.amount ?? ""), otherCurrency: String(editTx.otherCurrency ?? ""), currency: editTx.currency ?? "RMB" });
    } else {
      setPayer(userData[0]?.id);
      setPartner(userData.map((u) => u.id));
      setData({ title: "", amount: "", otherCurrency: "", currency: "RMB" });
    }
  }, [show]);

  const handleAdd = (e) => {
    e && e.preventDefault();
    const amount = parseFloat(data.amount);
    const otherCurrency = data.otherCurrency !== "" ? parseFloat(data.otherCurrency) : undefined;
    const currency = otherCurrency !== undefined ? data.currency : undefined;
    const partners = partner.length ? partner : [payer];
    setDialog(false);
    if (isEdit) {
      const updated = { ...editTx, label: data.title, payer, amount, otherCurrency, currency, partners };
      setTransactionData((prev) => prev.map((tx, i) => (i === editIndex ? updated : tx)));
    } else {
      setTransactionData((prev) => [...prev, { id: genId(), label: data.title, payer, amount, otherCurrency, currency, partners }]);
    }
  };

  return (
    <Modal show={show} onHide={() => setDialog(false)} centered>
      <Modal.Body>
        <div className="d-flex flex-column gap-2">
          <h3>Payer</h3>
          <div className="d-flex gap-2 flex-wrap">
            {userData.map((u) => (
              <SelectBox //
                key={`payer-box-${u.id}`}
                label={u.name}
                name="groupPayer"
                type="radio"
                checked={payer === u.id}
                onChange={(e) => e.target.checked && setPayer(u.id)}
              />
            ))}
          </div>
          <br />
          <Form.Control
            placeholder="Label"
            value={data.title || ""}
            onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))} //
          />
          <div className="d-flex gap-2">
            <Form.Select
              style={{ maxWidth: "110px" }}
              value={data.currency}
              onChange={(e) => setData((prev) => ({ ...prev, currency: e.target.value }))} //
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Form.Select>
            <Form.Control
              type="number"
              placeholder="Currency (optional)"
              pattern="\d*"
              value={data.otherCurrency || ""}
              onChange={(e) => setData((prev) => ({ ...prev, otherCurrency: e.target.value }))} //
            />
          </div>
          <Form.Control
            type="number"
            placeholder="Amount"
            pattern="\d*"
            value={data.amount || ""}
            onChange={(e) => setData((prev) => ({ ...prev, amount: e.target.value }))} //
          />
          <br />
          <div className="d-flex align-items-center justify-content-between gap-2">
            <h3 className="m-0">Partner</h3>
            <div className="d-flex gap-2">
              <ThemeBtn label="All" onClick={() => setPartner(userData.map((u) => u.id))} />
              <ThemeBtn label="None" onClick={() => setPartner([])} />
            </div>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {userData.map((u) => (
              <SelectBox //
                key={`partner-box-${u.id}`}
                label={u.name}
                name="groupPartner"
                checked={partner.includes(u.id)}
                onChange={() => {
                  if (partner.includes(u.id)) setPartner((prev) => prev.filter((id) => id != u.id));
                  else setPartner((prev) => [...prev, u.id]);
                }}
              />
            ))}
          </div>
        </div>

        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label={isEdit ? "Update" : "Add"} onClick={handleAdd} disabled={!data.amount} />
          <ThemeBtn label="Cancel" onClick={() => setDialog(false)} />
        </div>
      </Modal.Body>
    </Modal>
  );
}

function UsersModal({ show, setDialog, setUserData, setTransactionData, userData }) {
  const [newUserData, setNewUserData] = useState(userData);

  useMemo(() => {
    setNewUserData(userData);
  }, [show]);

  const handleSave = () => {
    const validIds = new Set(newUserData.map((u) => u.id));
    // drop transactions whose payer was removed; prune removed partners
    setTransactionData((prev) => prev.filter((tx) => validIds.has(tx.payer)).map((tx) => ({ ...tx, partners: tx.partners.filter((id) => validIds.has(id)) })));
    setUserData(newUserData);
    setDialog(false);
  };

  return (
    <Modal show={show} onHide={() => setDialog(false)} centered>
      <Modal.Body>
        <div className="d-flex flex-column gap-2">
          <h3>Partner</h3>
          <br />

          <div className="user-list d-flex flex-column gap-2">
            {newUserData.map((u, rowI) => (
              <div key={u.id} className="user-list__item d-flex gap-2 align-items-center">
                <Form.Control
                  placeholder="Name"
                  value={u.name || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewUserData((prev) => prev.map((v, i) => (i === rowI ? { ...v, name: val } : v)));
                  }}
                />
                {/* Per row now, so you can drop someone from the middle instead
                    of popping the last name off the end. Nothing here commits
                    until Save, so a mis-click costs a Cancel — but the sheet
                    needs at least one column to render, so the last row stays. */}
                <ThemeBtn
                  label="Del"
                  disabled={newUserData.length <= 1}
                  onClick={() => setNewUserData((prev) => prev.filter((_, i) => i !== rowI))} //
                />
              </div>
            ))}
          </div>
        </div>

        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label="Add" onClick={() => setNewUserData((prev) => [...prev, { id: genId(), name: "" }])} />
        </div>
        <hr />
        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label="Save" onClick={handleSave} />
          <ThemeBtn
            label="Cancel"
            onClick={() => {
              setDialog(false);
              setNewUserData(userData);
            }}
          />
        </div>
      </Modal.Body>
    </Modal>
  );
}

function SettleModal({ show, setDialog, settlements }) {
  return (
    <Modal show={show} onHide={() => setDialog(false)} centered>
      <Modal.Body>
        <div className="d-flex flex-column gap-2">
          <h3>Settle Up</h3>
          <br />
          {settlements.length === 0 ? (
            <div className="text-center">All settled 🎉</div>
          ) : (
            <div className="settle-list d-flex flex-column gap-2">
              {settlements.map((s, i) => (
                <div key={i} className="settle-list__item d-flex justify-content-between align-items-center">
                  <span>
                    {s.from} → {s.to}
                  </span>
                  <b>${s.amount.toFixed(2)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label="Close" onClick={() => setDialog(false)} />
        </div>
      </Modal.Body>
    </Modal>
  );
}

function SavesModal({ show, setDialog, saves, onSave, onLoad, onDelete }) {
  const [name, setName] = useState("");

  useMemo(() => {
    setName("");
  }, [show]);

  const sorted = [...saves].sort((a, b) => b.savedAt - a.savedAt);
  const trimmed = name.trim();

  const handleSave = () => {
    if (!trimmed) return;
    if (saves.some((s) => s.name === trimmed) && !confirm(`Overwrite save "${trimmed}"?`)) return;
    onSave(trimmed);
    setName("");
  };

  return (
    <Modal show={show} onHide={() => setDialog(false)} centered>
      <Modal.Body>
        <div className="d-flex flex-column gap-2">
          <h3>Saves</h3>
          <br />
          <div className="d-flex gap-2">
            <Form.Control
              placeholder="Save name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()} //
            />
            <ThemeBtn label="Save" onClick={handleSave} disabled={!trimmed} />
          </div>
          <hr />
          {sorted.length === 0 ? (
            <div className="text-center">No saved records</div>
          ) : (
            <div className="saves-list d-flex flex-column gap-2">
              {sorted.map((s) => (
                <div key={s.name} className="saves-list__item d-flex justify-content-between align-items-center gap-2">
                  <span className="saves-list__name">{s.name}</span>
                  <span className="d-flex gap-2">
                    <ThemeBtn label="Load" onClick={() => onLoad(s.name)} />
                    <ThemeBtn label="Delete" onClick={() => confirm(`Delete save "${s.name}"?`) && onDelete(s.name)} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label="Close" onClick={() => setDialog(false)} />
        </div>
      </Modal.Body>
    </Modal>
  );
}

function DataModal({ show, setDialog, tables, activeTableId, onSwitch, onNew, onRename, onDelete }) {
  const [name, setName] = useState("");

  useMemo(() => {
    setName("");
  }, [show]);

  const handleNew = () => {
    onNew(name.trim());
    setName("");
  };

  return (
    <Modal show={show} onHide={() => setDialog(false)} centered>
      <Modal.Body>
        <div className="d-flex flex-column gap-2">
          <h3>Tables</h3>
          <br />
          <div className="data-list d-flex flex-column gap-2">
            {tables.map((t) => {
              const active = t.id === activeTableId;
              return (
                <div key={t.id} className={"data-list__item d-flex gap-2 align-items-center" + (active ? " data-list__item--active" : "")}>
                  <Form.Control value={t.name} onChange={(e) => onRename(t.id, e.target.value)} />
                  {active ? <span className="data-list__badge">active</span> : <ThemeBtn label="Open" onClick={() => onSwitch(t.id)} />}
                  <ThemeBtn
                    label="Del"
                    onClick={() => {
                      const msg = tables.length > 1 ? `Delete table "${t.name}"?` : "Delete the only table? A new empty one will be created.";
                      if (confirm(msg)) onDelete(t.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
          <hr />
          <div className="d-flex gap-2">
            <Form.Control
              placeholder="New table name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNew()} //
            />
            <ThemeBtn label="New" onClick={handleNew} />
          </div>
        </div>

        <div className="d-flex gap-2 mt-4 justify-content-center">
          <ThemeBtn label="Close" onClick={() => setDialog(false)} />
        </div>
      </Modal.Body>
    </Modal>
  );
}
