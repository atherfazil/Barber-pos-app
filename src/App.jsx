import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Scissors, DollarSign, Wallet, Lock, BarChart3, Users, Settings as SettingsIcon,
  Plus, Minus, X, Check, ChevronLeft, Printer, Download, AlertTriangle, Banknote,
  CreditCard, PiggyBank, TrendingUp, FileText, ShieldCheck, LogOut, Trash2, Edit2,
  Camera, Paperclip, File as FileIcon
} from "lucide-react";
import { getData, setData, subscribeToChanges, isSharedMode, uploadAttachment, resolveLocalAttachment } from "./storage.js";

/* ---------------------------------------------------------------------
   FONTS + TOKENS
   Signature: a thin three-band "barber pole" rule (ink / brass / cream)
   used as the single recurring divider under every screen header.
--------------------------------------------------------------------- */
const FONT_DISPLAY = "'Roboto Slab', serif";
const FONT_BODY = "'Inter', sans-serif";

const INK = "#20241F";      // near-black green-charcoal
const BRASS = "#B08A3E";    // warm brass accent
const CREAM = "#F6F1E7";    // paper background
const PAPER = "#FFFFFF";
const RUST = "#9C4A2E";     // warnings / negative
const SAGE = "#4C6B54";     // positive / confirm

function PoleRule({ className = "" }) {
  return (
    <div className={`h-[3px] w-full flex ${className}`}>
      <div className="flex-1" style={{ background: INK }} />
      <div className="flex-1" style={{ background: BRASS }} />
      <div className="flex-1" style={{ background: RUST }} />
    </div>
  );
}

/* ---------------------------------------------------------------------
   STORAGE
--------------------------------------------------------------------- */
function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function niceDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });
}
function money(n, currency = "AED") {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function seedData() {
  const svcIds = { hc: uid("svc"), bd: uid("svc"), cb: uid("svc"), kd: uid("svc"), fc: uid("svc") };
  const barberIds = { ah: uid("bar"), bi: uid("bar"), us: uid("bar") };
  const partnerIds = { a: uid("ptn"), b: uid("ptn") };
  return {
    settings: {
      shopName: "Your Barber Shop",
      address: "",
      phone: "",
      currency: "AED",
      vatEnabled: false,
      vatRate: 5,
      openingCashDefault: 1000,
      retainedEarnings: 0,
    },
    partners: [
      { id: partnerIds.a, name: "Ather", ownership: 50 },
      { id: partnerIds.b, name: "Partner 2", ownership: 50 },
    ],
    services: [
      { id: svcIds.hc, name: "Haircut", price: 50, active: true },
      { id: svcIds.bd, name: "Beard", price: 30, active: true },
      { id: svcIds.cb, name: "Haircut + Beard", price: 70, active: true },
      { id: svcIds.kd, name: "Kids Haircut", price: 40, active: true },
      { id: svcIds.fc, name: "Facial", price: 80, active: true },
    ],
    barbers: [
      { id: barberIds.ah, name: "Ahmed", pin: "1111", active: true, compType: "commission", commissionPct: 40, fixedSalary: 0 },
      { id: barberIds.bi, name: "Bilal", pin: "2222", active: true, compType: "salary", commissionPct: 0, fixedSalary: 3500 },
      { id: barberIds.us, name: "Usman", pin: "3333", active: true, compType: "commission", commissionPct: 35, fixedSalary: 0 },
    ],
    expenseCategories: [
      "Rent", "Electricity", "Water", "Internet", "Cleaning", "Laundry", "Supplies",
      "Hair Products", "Towels", "Maintenance", "Equipment", "Marketing", "Bank Charges",
      "Government Fees", "Licenses", "Transportation", "Other"
    ],
    sales: [],
    expenses: [],
    bankTransactions: [],
    tillTransfers: [],
    dailyClosings: [],
    partnerLedger: [], // {id, partnerId, type: contribution|withdrawal|distribution, amount, date, note}
    auditLog: [],
    pettyCash: { opening: 500, adjustments: [] }, // adjustments: {id,date,type:'top-up'|'expense',amount,note}
    ownerPin: "0000",
  };
}

function useShopData() {
  const [data, setLocalData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const lastWrittenRef = React.useRef(null);

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      try {
        const existing = await getData();
        if (existing) {
          setLocalData(existing);
          lastWrittenRef.current = JSON.stringify(existing);
        } else {
          const seed = seedData();
          setLocalData(seed);
          lastWrittenRef.current = JSON.stringify(seed);
          await setData(seed);
        }
        setStatus("ready");
      } catch (e) {
        const seed = seedData();
        setLocalData(seed);
        setStatus("ready");
      }

      // Live updates from another device (Supabase shared mode only;
      // a no-op in local mode). Skip echoes of our own writes.
      unsubscribe = subscribeToChanges((incoming) => {
        const incomingJson = JSON.stringify(incoming);
        if (incomingJson !== lastWrittenRef.current) {
          lastWrittenRef.current = incomingJson;
          setLocalData(incoming);
        }
      });
    })();
    return () => unsubscribe();
  }, []);

  const persist = useCallback(async (next) => {
    setLocalData(next);
    lastWrittenRef.current = JSON.stringify(next);
    try {
      await setData(next);
    } catch (e) {
      // best effort; keep working in memory
      console.error("Storage save failed", e);
    }
  }, []);

  return { data, status, persist };
}

/* ---------------------------------------------------------------------
   SHARED UI PRIMITIVES
--------------------------------------------------------------------- */
function BigButton({ icon: Icon, label, sub, onClick, tone = "ink", disabled }) {
  const tones = {
    ink: { bg: INK, fg: PAPER },
    brass: { bg: BRASS, fg: INK },
    cream: { bg: PAPER, fg: INK, border: true },
    rust: { bg: RUST, fg: PAPER },
    sage: { bg: SAGE, fg: PAPER },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${t.border ? "border-2" : ""}`}
      style={{ background: t.bg, color: t.fg, borderColor: t.border ? INK : undefined, fontFamily: FONT_BODY }}
    >
      {Icon && <Icon size={30} strokeWidth={1.8} />}
      <span className="text-base font-semibold">{label}</span>
      {sub && <span className="text-xs opacity-80">{sub}</span>}
    </button>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div className="sticky top-0 z-10" style={{ background: CREAM }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1 rounded-full hover:bg-black/5">
              <ChevronLeft size={22} color={INK} />
            </button>
          )}
          <h1 style={{ fontFamily: FONT_DISPLAY, color: INK }} className="text-xl font-bold">{title}</h1>
        </div>
        {right}
      </div>
      <PoleRule />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: INK, opacity: 0.6, fontFamily: FONT_BODY }}>{label}</div>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-xl border px-3 py-2.5 text-base outline-none focus:ring-2";
const inputStyle = { borderColor: "#DDD6C6", fontFamily: FONT_BODY, color: INK };

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm p-4 ${className}`} style={{ border: "1px solid #EAE3D3" }}>
      {children}
    </div>
  );
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2"
      style={{ background: INK, color: PAPER, fontFamily: FONT_BODY }}>
      <Check size={18} /> {message}
    </div>
  );
}

/* ---------------------------------------------------------------------
   ATTACHMENTS — photo or PDF picker + viewer, used on sales and expenses
--------------------------------------------------------------------- */
function AttachmentPicker({ file, onChange }) {
  const previewUrl = useMemo(() => (file && file.type !== "application/pdf" ? URL.createObjectURL(file) : null), [file]);

  return (
    <div>
      {!file && (
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-xl py-3 flex flex-col items-center gap-1 cursor-pointer" style={{ background: "#EFE9DA", color: INK }}>
            <Camera size={18} />
            <span className="text-xs font-medium">Take Photo</span>
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => e.target.files[0] && onChange(e.target.files[0])} />
          </label>
          <label className="rounded-xl py-3 flex flex-col items-center gap-1 cursor-pointer" style={{ background: "#EFE9DA", color: INK }}>
            <Paperclip size={18} />
            <span className="text-xs font-medium">Choose File</span>
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => e.target.files[0] && onChange(e.target.files[0])} />
          </label>
        </div>
      )}
      {file && (
        <div className="flex items-center gap-3 rounded-xl p-2" style={{ background: "#EFE9DA" }}>
          {file.type === "application/pdf" ? (
            <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: PAPER }}>
              <FileIcon size={22} color={BRASS} />
            </div>
          ) : (
            <img src={previewUrl} alt="Attachment preview" className="w-14 h-14 rounded-lg object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: INK }}>{file.name}</div>
            <div className="text-xs" style={{ color: INK, opacity: 0.5 }}>{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button onClick={() => onChange(null)} className="p-2"><X size={16} color={RUST} /></button>
        </div>
      )}
    </div>
  );
}

function AttachmentLink({ attachment }) {
  const [href, setHref] = useState(attachment.url.startsWith("local:") ? null : attachment.url);

  useEffect(() => {
    let revoke = null;
    if (attachment.url.startsWith("local:")) {
      resolveLocalAttachment(attachment.url).then((url) => {
        if (url) { setHref(url); revoke = url; }
      });
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [attachment.url]);

  if (!href) return <span className="text-xs" style={{ color: INK, opacity: 0.4 }}>Loading attachment…</span>;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: BRASS }}>
      <Paperclip size={12} /> {attachment.kind === "pdf" ? "View PDF" : "View photo"}
    </a>
  );
}

/* ---------------------------------------------------------------------
   DERIVED CALCS
--------------------------------------------------------------------- */
function commissionFor(barber, netAmount) {
  if (barber.compType === "salary") return 0;
  if (barber.compType === "commission") return netAmount * (Number(barber.commissionPct) || 0) / 100;
  if (barber.compType === "hybrid") return netAmount * (Number(barber.commissionPct) || 0) / 100;
  return 0;
}

function isDayLocked(data, date) {
  const c = data.dailyClosings.find((c) => c.date === date);
  return !!(c && c.locked);
}

function salesForDate(data, date) {
  return data.sales.filter((s) => s.date === date && s.status !== "void");
}
function expensesForDate(data, date) {
  return data.expenses.filter((e) => e.date === date && e.status !== "void");
}

function cashSummaryForDate(data, date) {
  const sales = salesForDate(data, date);
  const exps = expensesForDate(data, date);
  const cashSales = sales.reduce((sum, s) => sum + (s.payment.cash || 0), 0);
  const cardSales = sales.reduce((sum, s) => sum + (s.payment.card || 0), 0);
  const cashExpenses = exps.filter((e) => e.payment === "cash").reduce((sum, e) => sum + Number(e.amount), 0);
  const cardExpenses = exps.filter((e) => e.payment === "card").reduce((sum, e) => sum + Number(e.amount), 0);
  const totalSales = cashSales + cardSales;
  const totalExpenses = cashExpenses + cardExpenses;
  return { sales, exps, cashSales, cardSales, cashExpenses, cardExpenses, totalSales, totalExpenses };
}

function openingCashForDate(data, date) {
  const sorted = [...data.dailyClosings].sort((a, b) => (a.date < b.date ? 1 : -1));
  const prior = sorted.find((c) => c.date < date);
  if (prior) return prior.actualCash;
  return data.settings.openingCashDefault;
}

// Cash physically leaving the sales till today, other than register
// expenses: bank deposits and transfers into petty cash. Both reduce
// what should be sitting in the drawer.
function tillTransfersForDate(data, date) {
  return (data.tillTransfers || []).filter((t) => t.date === date && !t.voided);
}
function bankDepositsForDate(data, date) {
  return data.bankTransactions.filter((t) => t.date === date && t.type === "deposit" && !t.voided);
}
function expectedCashForDate(data, date) {
  const cs = cashSummaryForDate(data, date);
  const opening = openingCashForDate(data, date);
  const transfersOut = tillTransfersForDate(data, date).reduce((sum, t) => sum + t.amount, 0);
  const depositsOut = bankDepositsForDate(data, date).reduce((sum, t) => sum + t.amount, 0);
  return opening + cs.cashSales - cs.cashExpenses - transfersOut - depositsOut;
}

// Petty cash is its own till: a starting float, plus manual top-ups and
// transfers in from the sales till, minus petty expenses. It never
// touches the sales till's own cash math above.
function pettyCashBalance(data) {
  const adjustments = data.pettyCash.adjustments.filter((a) => !a.voided);
  const fromAdjustments = adjustments.reduce((sum, a) => sum + (a.type === "top-up" ? a.amount : -a.amount), 0);
  const fromTillTransfers = (data.tillTransfers || []).filter((t) => !t.voided).reduce((sum, t) => sum + t.amount, 0);
  return data.pettyCash.opening + fromAdjustments + fromTillTransfers;
}

function monthKey(date) { return date.slice(0, 7); }

function pnlForMonth(data, ym) {
  const sales = data.sales.filter((s) => s.date.startsWith(ym) && s.status !== "void");
  const exps = data.expenses.filter((e) => e.date.startsWith(ym) && e.status !== "void");
  const grossRevenue = sales.reduce((sum, s) => sum + s.gross, 0);
  const discounts = sales.reduce((sum, s) => sum + (s.discount || 0), 0);
  const netRevenue = sales.reduce((sum, s) => sum + s.net, 0);

  const commissionByBarber = {};
  data.barbers.forEach((b) => (commissionByBarber[b.id] = 0));
  sales.forEach((s) => {
    const b = data.barbers.find((b) => b.id === s.barberId);
    if (b) commissionByBarber[b.id] = (commissionByBarber[b.id] || 0) + commissionFor(b, s.net);
  });
  const totalCommission = Object.values(commissionByBarber).reduce((a, b) => a + b, 0);
  const fixedSalaries = data.barbers.filter((b) => b.compType === "salary" || b.compType === "hybrid")
    .reduce((sum, b) => sum + (b.compType === "salary" ? Number(b.fixedSalary || 0) : Number(b.fixedSalary || 0)), 0);

  const opExpenses = exps.filter((e) => e.category !== "Barber Commission")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const grossProfit = netRevenue - totalCommission;
  const netProfit = grossProfit - fixedSalaries - opExpenses;

  return {
    grossRevenue, discounts, netRevenue, totalCommission, commissionByBarber,
    fixedSalaries, opExpenses, grossProfit, netProfit, expenseList: exps, salesList: sales
  };
}

function partnerLedgerBalance(data, partnerId) {
  return data.partnerLedger.filter((l) => l.partnerId === partnerId).reduce((sum, l) => {
    if (l.type === "contribution") return sum + l.amount;
    return sum - l.amount; // withdrawal or distribution reduce balance owed/held
  }, 0);
}

/* ---------------------------------------------------------------------
   APP
--------------------------------------------------------------------- */
export default function App() {
  const { data, status, persist } = useShopData();
  const [view, setView] = useState("login");
  const [session, setSession] = useState(null); // {role:'owner'|'barber', barberId?}
  const [toast, setToast] = useState(null);

  if (status === "loading" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: CREAM }}>
        <div style={{ fontFamily: FONT_BODY, color: INK }}>Loading shop data…</div>
      </div>
    );
  }

  const say = (msg) => setToast(msg);

  const logAudit = (list, entry) => [
    ...list,
    { id: uid("aud"), timestamp: new Date().toISOString(), user: session?.name || "system", ...entry },
  ];

  const goHome = () => setView(session?.role === "owner" ? "dashboard" : "posHome");

  return (
    <div className="min-h-screen w-full" style={{ background: CREAM, fontFamily: FONT_BODY }}>
      <div className="max-w-md mx-auto min-h-screen relative pb-8" style={{ background: CREAM }}>
        {view === "login" && (
          <Login data={data} onLogin={(s) => { setSession(s); setView(s.role === "owner" ? "dashboard" : "posHome"); }} />
        )}

        {view !== "login" && session && (
          <>
            <TopBar shopName={data.settings.shopName} session={session} onLogout={() => { setSession(null); setView("login"); }} onHome={goHome} />

            {view === "dashboard" && <Dashboard data={data} onNav={setView} />}
            {view === "posHome" && <PosHome session={session} onNav={setView} />}

            {view === "sale" && (
              <NewSale
                data={data} session={session} say={say}
                onSave={async (sale, attachmentFile, setSaving) => {
                  setSaving(true);
                  let toSave = sale;
                  if (attachmentFile) {
                    try {
                      const att = await uploadAttachment(attachmentFile, sale.id);
                      toSave = { ...sale, attachment: att };
                    } catch (e) {
                      say("Sale saved, but attachment upload failed");
                    }
                  }
                  const next = { ...data, sales: [...data.sales, toSave], auditLog: logAudit(data.auditLog, { action: "sale_created", details: `${toSave.id} ${money(toSave.net, data.settings.currency)}` }) };
                  await persist(next);
                  setSaving(false);
                  say("Sale saved");
                  setView(session.role === "owner" ? "dashboard" : "posHome");
                }}
                onCancel={goHome}
              />
            )}

            {view === "expense" && (
              <NewExpense
                data={data} session={session} say={say}
                onSave={async (exp, attachmentFile, setSaving) => {
                  setSaving(true);
                  let toSave = exp;
                  if (attachmentFile) {
                    try {
                      const att = await uploadAttachment(attachmentFile, exp.id);
                      toSave = { ...exp, attachment: att };
                    } catch (e) {
                      say("Expense saved, but attachment upload failed");
                    }
                  }
                  const next = { ...data, expenses: [...data.expenses, toSave], auditLog: logAudit(data.auditLog, { action: "expense_created", details: `${toSave.id} ${money(toSave.amount, data.settings.currency)}` }) };
                  await persist(next);
                  setSaving(false);
                  say("Expense saved");
                  setView(session.role === "owner" ? "dashboard" : "posHome");
                }}
                onCancel={goHome}
              />
            )}

            {view === "cash" && (
              <CashPettyCash data={data} session={session} say={say} persist={persist} logAudit={logAudit} onBack={goHome} />
            )}

            {view === "closing" && (
              <DailyClosing data={data} session={session} say={say} persist={persist} logAudit={logAudit} onBack={goHome} />
            )}

            {view === "barbers" && session.role === "owner" && (
              <BarbersAdmin data={data} persist={persist} logAudit={logAudit} onBack={goHome} />
            )}

            {view === "services" && session.role === "owner" && (
              <ServicesAdmin data={data} persist={persist} logAudit={logAudit} onBack={goHome} />
            )}

            {view === "reports" && session.role === "owner" && (
              <Reports data={data} onBack={goHome} session={session} say={say}
                onVoidSale={async (saleId, reason) => {
                  const next = {
                    ...data,
                    sales: data.sales.map((s) => s.id === saleId ? { ...s, status: "void", voidReason: reason, voidedBy: session.name, voidedAt: new Date().toISOString() } : s),
                    auditLog: logAudit(data.auditLog, { action: "sale_voided", details: `${saleId} — ${reason}` }),
                  };
                  await persist(next);
                  say("Sale deleted");
                }}
                onVoidExpense={async (expenseId, reason) => {
                  const next = {
                    ...data,
                    expenses: data.expenses.map((e) => e.id === expenseId ? { ...e, status: "void", voidReason: reason, voidedBy: session.name, voidedAt: new Date().toISOString() } : e),
                    auditLog: logAudit(data.auditLog, { action: "expense_voided", details: `${expenseId} — ${reason}` }),
                  };
                  await persist(next);
                  say("Expense deleted");
                }}
              />
            )}

            {view === "partners" && session.role === "owner" && (
              <PartnersView data={data} persist={persist} logAudit={logAudit} onBack={goHome} say={say} />
            )}

            {view === "settings" && session.role === "owner" && (
              <SettingsView data={data} persist={persist} onBack={goHome} say={say} />
            )}

            {view === "auditlog" && session.role === "owner" && (
              <AuditLogView data={data} onBack={goHome} />
            )}
          </>
        )}

        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  );
}

function TopBar({ shopName, session, onLogout, onHome }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3">
      <button onClick={onHome} className="flex items-center gap-2">
        <Scissors size={18} color={BRASS} />
        <span style={{ fontFamily: FONT_DISPLAY, color: INK }} className="font-bold text-sm">{shopName}</span>
        {isSharedMode && (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#E4EEE6", color: SAGE }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: SAGE }} /> LIVE
          </span>
        )}
      </button>
      <div className="flex items-center gap-3">
        <span className="text-xs" style={{ color: INK, opacity: 0.6 }}>{session.name}</span>
        <button onClick={onLogout} title="Log out"><LogOut size={16} color={INK} /></button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   LOGIN
--------------------------------------------------------------------- */
function Login({ data, onLogin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const tryLogin = () => {
    if (pin === data.ownerPin) {
      onLogin({ role: "owner", name: "Owner" });
      return;
    }
    const b = data.barbers.find((b) => b.pin === pin && b.active);
    if (b) {
      onLogin({ role: "barber", name: b.name, barberId: b.id });
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: INK }}>
      <Scissors size={40} color={BRASS} />
      <h1 style={{ fontFamily: FONT_DISPLAY, color: PAPER }} className="text-2xl font-bold mt-3">{data.settings.shopName}</h1>
      <p style={{ color: "#C9C2AE" }} className="text-sm mt-1 mb-8">Enter your PIN to start</p>

      <div className="text-3xl tracking-[0.6em] mb-6 h-10" style={{ color: PAPER, fontFamily: FONT_DISPLAY }}>
        {"•".repeat(pin.length).padEnd(4, " ")}
      </div>

      {error && <div className="text-sm mb-4" style={{ color: "#E8A98A" }}>{error}</div>}

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1","2","3","4","5","6","7","8","9"].map((n) => (
          <button key={n} onClick={() => pin.length < 6 && setPin(pin + n)}
            className="rounded-2xl py-4 text-xl font-semibold active:scale-95 transition"
            style={{ background: "#2C3229", color: PAPER }}>{n}</button>
        ))}
        <button onClick={() => setPin("")} className="rounded-2xl py-4 text-sm font-semibold" style={{ background: "#2C3229", color: "#C9C2AE" }}>Clear</button>
        <button onClick={() => pin.length < 6 && setPin(pin + "0")} className="rounded-2xl py-4 text-xl font-semibold active:scale-95 transition" style={{ background: "#2C3229", color: PAPER }}>0</button>
        <button onClick={tryLogin} className="rounded-2xl py-4 font-semibold active:scale-95 transition" style={{ background: BRASS, color: INK }}>Go</button>
      </div>

      <p className="text-xs mt-8" style={{ color: "#7A806E" }}>Demo owner PIN 0000 · barbers 1111 / 2222 / 3333</p>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BARBER SIMPLE HOME
--------------------------------------------------------------------- */
function PosHome({ session, onNav }) {
  return (
    <div className="px-4 pt-6">
      <Header title={`Hi, ${session.name}`} />
      <div className="grid grid-cols-2 gap-4 mt-6">
        <BigButton icon={Plus} label="New Sale" tone="ink" onClick={() => onNav("sale")} />
        <BigButton icon={Minus} label="Expense" tone="cream" onClick={() => onNav("expense")} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   OWNER DASHBOARD
--------------------------------------------------------------------- */
function Dashboard({ data, onNav }) {
  const today = todayStr();
  const cs = cashSummaryForDate(data, today);
  const ym = today.slice(0, 7);
  const pnl = pnlForMonth(data, ym);
  const opening = openingCashForDate(data, today);
  const expectedCash = expectedCashForDate(data, today);
  const locked = isDayLocked(data, today);
  const lowIncomplete = data.dailyClosings.length === 0;

  return (
    <div className="px-4 pt-4">
      <Header title="Dashboard" right={locked ? <span className="text-xs px-2 py-1 rounded-full" style={{ background: RUST, color: PAPER }}>Day closed</span> : null} />

      <div className="grid grid-cols-2 gap-3 mt-4">
        <BigButton icon={Plus} label="New Sale" tone="ink" onClick={() => onNav("sale")} disabled={locked} />
        <BigButton icon={Minus} label="Expense" tone="cream" onClick={() => onNav("expense")} disabled={locked} />
        <BigButton icon={PiggyBank} label="Cash / Petty Cash" tone="cream" onClick={() => onNav("cash")} />
        <BigButton icon={Lock} label="Daily Closing" tone="brass" onClick={() => onNav("closing")} />
        <BigButton icon={BarChart3} label="Reports" tone="cream" onClick={() => onNav("reports")} />
        <BigButton icon={Users} label="Barbers" tone="cream" onClick={() => onNav("barbers")} />
        <BigButton icon={Scissors} label="Services" tone="cream" onClick={() => onNav("services")} />
        <BigButton icon={SettingsIcon} label="Settings" tone="cream" onClick={() => onNav("settings")} />
      </div>

      <button onClick={() => onNav("partners")} className="w-full mt-4">
        <Card>
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: FONT_DISPLAY, color: INK }} className="font-semibold">Partner Accounts</span>
            <TrendingUp size={18} color={BRASS} />
          </div>
        </Card>
      </button>

      <button onClick={() => onNav("auditlog")} className="w-full mt-3">
        <Card>
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: FONT_DISPLAY, color: INK }} className="font-semibold">Audit Log</span>
            <ShieldCheck size={18} color={BRASS} />
          </div>
        </Card>
      </button>

      <div className="mt-5">
        <h2 className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.6 }}>Today, {niceDate(today)}</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Sales" value={money(cs.totalSales, data.settings.currency)} />
          <StatCard label="Expenses" value={money(cs.totalExpenses, data.settings.currency)} />
          <StatCard label="Cash Sales" value={money(cs.cashSales, data.settings.currency)} />
          <StatCard label="Card Sales" value={money(cs.cardSales, data.settings.currency)} />
          <StatCard label="Expected Cash" value={money(expectedCash, data.settings.currency)} full />
        </div>
      </div>

      <div className="mt-5">
        <h2 className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.6 }}>This Month</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Net Revenue" value={money(pnl.netRevenue, data.settings.currency)} />
          <StatCard label="Commissions" value={money(pnl.totalCommission, data.settings.currency)} />
          <StatCard label="Op. Expenses" value={money(pnl.opExpenses + pnl.fixedSalaries, data.settings.currency)} />
          <StatCard label="Net Profit" value={money(pnl.netProfit, data.settings.currency)} highlight />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, full, highlight }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Card>
        <div className="text-xs" style={{ color: INK, opacity: 0.55 }}>{label}</div>
        <div className="text-lg font-bold mt-1" style={{ fontFamily: FONT_DISPLAY, color: highlight ? SAGE : INK }}>{value}</div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------
   NEW SALE
--------------------------------------------------------------------- */
function NewSale({ data, session, onSave, onCancel, say }) {
  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState(null);
  const [barberId, setBarberId] = useState(session.role === "barber" ? session.barberId : null);
  const [discountType, setDiscountType] = useState("none"); // none, fixed, pct
  const [discountValue, setDiscountValue] = useState("");
  const [tip, setTip] = useState("");
  const [payMethod, setPayMethod] = useState("cash"); // cash, card, split
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const today = todayStr();
  if (isDayLocked(data, today)) {
    return (
      <div className="px-4 pt-4">
        <Header title="New Sale" onBack={onCancel} />
        <Card className="mt-4"><p>Today's register is closed. Ask the owner to reopen the day before recording sales.</p></Card>
      </div>
    );
  }

  const service = data.services.find((s) => s.id === serviceId);
  const gross = isCustom ? (Number(customAmount) || 0) : (service ? service.price : 0);
  const displayName = isCustom ? (customLabel.trim() || "Custom Amount") : service?.name;
  let discount = 0;
  if (discountType === "fixed") discount = Number(discountValue) || 0;
  if (discountType === "pct") discount = gross * (Number(discountValue) || 0) / 100;
  discount = Math.min(discount, gross);
  const net = gross - discount;
  const tipAmt = Number(tip) || 0;
  const total = net + tipAmt;
  const barber = data.barbers.find((b) => b.id === barberId);
  const activeBarbers = data.barbers.filter((b) => b.active);
  const activeServices = data.services.filter((s) => s.active);

  const hasLineItem = isCustom ? Number(customAmount) > 0 : Boolean(service);
  const canSave = hasLineItem && barber && !saving && (payMethod !== "split" || (Number(splitCash) + Number(splitCard) === total));

  const handleSave = () => {
    let payment = { cash: 0, card: 0 };
    if (payMethod === "cash") payment = { cash: total, card: 0 };
    if (payMethod === "card") payment = { cash: 0, card: total };
    if (payMethod === "split") payment = { cash: Number(splitCash) || 0, card: Number(splitCard) || 0 };

    const sale = {
      id: uid("SALE"), date: today, time: new Date().toISOString(),
      serviceId: isCustom ? null : serviceId, serviceName: displayName, isCustomAmount: isCustom,
      barberId, barberName: barber.name,
      gross, discount, net, tip: tipAmt, payment, status: "completed",
      enteredBy: session.name,
    };
    onSave(sale, attachmentFile, setSaving);
  };

  return (
    <div className="px-4 pt-4">
      <Header title="New Sale" onBack={onCancel} />

      {step === 1 && !isCustom && (
        <div className="mt-4">
          <div className="text-sm mb-2" style={{ color: INK, opacity: 0.7 }}>Select service</div>
          <div className="grid grid-cols-2 gap-3">
            {activeServices.map((s) => (
              <button key={s.id} onClick={() => { setServiceId(s.id); setStep(barber ? 3 : 2); }}
                className="rounded-2xl p-4 text-left shadow-sm active:scale-[0.97] transition"
                style={{ background: PAPER, border: `1.5px solid ${serviceId === s.id ? BRASS : "#EAE3D3"}` }}>
                <div className="font-semibold" style={{ color: INK }}>{s.name}</div>
                <div className="text-sm mt-1" style={{ color: BRASS }}>{money(s.price, data.settings.currency)}</div>
              </button>
            ))}
            <button onClick={() => { setServiceId(null); setIsCustom(true); }}
              className="rounded-2xl p-4 text-left shadow-sm active:scale-[0.97] transition"
              style={{ background: PAPER, border: `1.5px dashed ${BRASS}` }}>
              <div className="font-semibold flex items-center gap-1.5" style={{ color: INK }}><DollarSign size={16} color={BRASS} /> Custom Amount</div>
              <div className="text-sm mt-1" style={{ color: INK, opacity: 0.6 }}>Enter your own price</div>
            </button>
          </div>
        </div>
      )}

      {step === 1 && isCustom && (
        <div className="mt-4 space-y-4">
          <div className="text-sm mb-1" style={{ color: INK, opacity: 0.7 }}>Custom amount</div>
          <Field label={`Amount (${data.settings.currency})`}>
            <input type="number" inputMode="decimal" className={inputCls} style={inputStyle}
              value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="0.00" autoFocus />
          </Field>
          <Field label="What is it for? (optional)">
            <input className={inputCls} style={inputStyle} value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. special package" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setIsCustom(false); setCustomAmount(""); setCustomLabel(""); }}
              className="rounded-2xl py-3.5 font-semibold" style={{ background: "#EFE9DA", color: INK }}>Back to Services</button>
            <button disabled={!(Number(customAmount) > 0)} onClick={() => setStep(barber ? 3 : 2)}
              className="rounded-2xl py-3.5 font-bold disabled:opacity-40" style={{ background: BRASS, color: INK }}>Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4">
          <div className="text-sm mb-2" style={{ color: INK, opacity: 0.7 }}>Who performed this service?</div>
          <div className="grid grid-cols-2 gap-3">
            {activeBarbers.map((b) => (
              <button key={b.id} onClick={() => { setBarberId(b.id); setStep(3); }}
                className="rounded-2xl p-5 text-center shadow-sm active:scale-[0.97] transition"
                style={{ background: PAPER, border: `1.5px solid ${barberId === b.id ? BRASS : "#EAE3D3"}` }}>
                <div className="font-semibold" style={{ color: INK }}>{b.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-4">
          <Card>
            <div className="flex justify-between text-sm"><span>Service</span><span className="font-semibold">{displayName}</span></div>
            <div className="flex justify-between text-sm mt-1"><span>Barber</span><span className="font-semibold">{barber?.name}</span></div>
          </Card>

          <Field label="Discount">
            <div className="flex gap-2 mb-2">
              {["none", "fixed", "pct"].map((t) => (
                <button key={t} onClick={() => setDiscountType(t)}
                  className="flex-1 rounded-xl py-2 text-sm font-medium"
                  style={{ background: discountType === t ? INK : "#EFE9DA", color: discountType === t ? PAPER : INK }}>
                  {t === "none" ? "None" : t === "fixed" ? `${data.settings.currency}` : "%"}
                </button>
              ))}
            </div>
            {discountType !== "none" && (
              <input type="number" inputMode="decimal" className={inputCls} style={inputStyle}
                value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "fixed" ? "Discount amount" : "Discount %"} />
            )}
          </Field>

          <Field label="Tip (optional)">
            <input type="number" inputMode="decimal" className={inputCls} style={inputStyle}
              value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00" />
          </Field>

          <Field label="Payment method">
            <div className="grid grid-cols-3 gap-2">
              {[{ k: "cash", l: "Cash", i: Banknote }, { k: "card", l: "Card", i: CreditCard }, { k: "split", l: "Split", i: DollarSign }].map((p) => (
                <button key={p.k} onClick={() => setPayMethod(p.k)}
                  className="rounded-xl py-3 flex flex-col items-center gap-1"
                  style={{ background: payMethod === p.k ? BRASS : "#EFE9DA", color: INK }}>
                  <p.i size={18} /><span className="text-xs font-medium">{p.l}</span>
                </button>
              ))}
            </div>
          </Field>

          {payMethod === "split" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cash">
                <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={splitCash} onChange={(e) => setSplitCash(e.target.value)} />
              </Field>
              <Field label="Card">
                <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={splitCard} onChange={(e) => setSplitCard(e.target.value)} />
              </Field>
            </div>
          )}

          <Card>
            <Row label="Gross" value={money(gross, data.settings.currency)} />
            <Row label="Discount" value={`- ${money(discount, data.settings.currency)}`} />
            <Row label="Net" value={money(net, data.settings.currency)} />
            <Row label="Tip" value={money(tipAmt, data.settings.currency)} />
            <div className="h-px my-2" style={{ background: "#EAE3D3" }} />
            <Row label="Total" value={money(total, data.settings.currency)} bold />
          </Card>

          <Field label="Attach receipt / card slip (optional)">
            <AttachmentPicker file={attachmentFile} onChange={setAttachmentFile} />
          </Field>

          <button disabled={!canSave} onClick={handleSave}
            className="w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
            style={{ background: SAGE, color: PAPER, fontFamily: FONT_DISPLAY }}>
            {saving ? "SAVING…" : "SAVE SALE"}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span style={{ color: INK, opacity: 0.7 }}>{label}</span>
      <span style={{ color: INK, fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------
   NEW EXPENSE
--------------------------------------------------------------------- */
function NewExpense({ data, session, onSave, onCancel }) {
  const [category, setCategory] = useState(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState("cash");
  const [description, setDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const today = todayStr();
  if (isDayLocked(data, today)) {
    return (
      <div className="px-4 pt-4">
        <Header title="Expense" onBack={onCancel} />
        <Card className="mt-4"><p>Today's register is closed. Ask the owner to reopen the day.</p></Card>
      </div>
    );
  }

  const canSave = category && Number(amount) > 0 && !saving;

  const handleSave = () => {
    const exp = {
      id: uid("EXP"), date: today, category, amount: Number(amount), payment, description,
      enteredBy: session.name,
    };
    onSave(exp, attachmentFile, setSaving);
  };

  return (
    <div className="px-4 pt-4">
      <Header title="Expense" onBack={onCancel} />
      <div className="mt-4 space-y-4">
        <Field label="Category">
          <div className="grid grid-cols-2 gap-2">
            {data.expenseCategories.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className="rounded-xl py-2.5 text-sm font-medium text-left px-3"
                style={{ background: category === c ? BRASS : "#EFE9DA", color: INK }}>{c}</button>
            ))}
          </div>
        </Field>

        <Field label="Amount">
          <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>

        <Field label="Payment method">
          <div className="grid grid-cols-2 gap-2">
            {[{ k: "cash", l: "Cash" }, { k: "card", l: "Card" }].map((p) => (
              <button key={p.k} onClick={() => setPayment(p.k)}
                className="rounded-xl py-3 font-medium" style={{ background: payment === p.k ? BRASS : "#EFE9DA", color: INK }}>{p.l}</button>
            ))}
          </div>
        </Field>

        <Field label="Description (optional)">
          <input className={inputCls} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. two towels bought" />
        </Field>

        <Field label="Attach bill / receipt (optional)">
          <AttachmentPicker file={attachmentFile} onChange={setAttachmentFile} />
        </Field>

        <button disabled={!canSave} onClick={handleSave}
          className="w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
          style={{ background: RUST, color: PAPER, fontFamily: FONT_DISPLAY }}>
          {saving ? "SAVING…" : "SAVE EXPENSE"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   CASH / PETTY CASH
--------------------------------------------------------------------- */
function CashPettyCash({ data, session, persist, logAudit, onBack, say }) {
  const [tab, setTab] = useState("register"); // register | petty | transfer | deposit
  const [deletingAdj, setDeletingAdj] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const today = todayStr();
  const cs = cashSummaryForDate(data, today);
  const opening = openingCashForDate(data, today);
  const expected = expectedCashForDate(data, today);
  const transfersToday = tillTransfersForDate(data, today).reduce((sum, t) => sum + t.amount, 0);
  const depositsToday = bankDepositsForDate(data, today).reduce((sum, t) => sum + t.amount, 0);

  const pettyBalance = pettyCashBalance(data);
  const isOwner = session.role === "owner";

  const [pettyAmt, setPettyAmt] = useState("");
  const [pettyNote, setPettyNote] = useState("");
  const [pettyType, setPettyType] = useState("expense");

  const [transferAmt, setTransferAmt] = useState("");
  const [depositAmt, setDepositAmt] = useState("");

  const addPetty = async () => {
    if (!Number(pettyAmt)) return;
    const next = {
      ...data,
      pettyCash: { ...data.pettyCash, adjustments: [...data.pettyCash.adjustments, { id: uid("PC"), date: today, type: pettyType, amount: Number(pettyAmt), note: pettyNote, enteredBy: session.name }] },
      auditLog: logAudit(data.auditLog, { action: "petty_cash", details: `${pettyType} ${money(pettyAmt, data.settings.currency)}` }),
    };
    await persist(next);
    say("Petty cash updated");
    setPettyAmt(""); setPettyNote("");
  };

  const doTransfer = async () => {
    const amt = Number(transferAmt);
    if (!amt || amt > expected) return;
    const next = {
      ...data,
      tillTransfers: [...(data.tillTransfers || []), { id: uid("TXF"), date: today, amount: amt, note: "Sales till → Petty cash", transferredBy: session.name }],
      auditLog: logAudit(data.auditLog, { action: "till_transfer", details: `${money(amt, data.settings.currency)} moved to petty cash` }),
    };
    await persist(next);
    say("Cash moved to petty cash");
    setTransferAmt("");
  };

  const doDeposit = async () => {
    if (!Number(depositAmt) || Number(depositAmt) > expected) return;
    const next = {
      ...data,
      bankTransactions: [...data.bankTransactions, { id: uid("BNK"), date: today, type: "deposit", amount: Number(depositAmt), description: "Cash deposit to bank" }],
      auditLog: logAudit(data.auditLog, { action: "bank_deposit", details: money(depositAmt, data.settings.currency) }),
    };
    await persist(next);
    say("Deposit recorded");
    setDepositAmt("");
  };

  const confirmDeleteAdjustment = async () => {
    const next = {
      ...data,
      pettyCash: {
        ...data.pettyCash,
        adjustments: data.pettyCash.adjustments.map((a) => a.id === deletingAdj.id
          ? { ...a, voided: true, voidReason: deleteReason.trim() || "No reason given", voidedBy: session.name, voidedAt: new Date().toISOString() }
          : a),
      },
      auditLog: logAudit(data.auditLog, { action: "petty_cash_deleted", details: `${deletingAdj.id} — ${deleteReason.trim() || "No reason given"}` }),
    };
    await persist(next);
    say("Entry deleted");
    setDeletingAdj(null);
    setDeleteReason("");
  };

  const bankBalance = data.bankTransactions.reduce((sum, t) => sum + (t.type === "deposit" ? t.amount : -t.amount), 0)
    + data.sales.filter((s) => s.status !== "void").reduce((sum, s) => sum + (s.payment.card || 0), 0);

  const recentPettyEntries = data.pettyCash.adjustments.slice().reverse().slice(0, 25);

  return (
    <div className="px-4 pt-4">
      <Header title="Cash & Petty Cash" onBack={onBack} />
      <div className="flex gap-2 mt-4 mb-4 flex-wrap">
        {[{ k: "register", l: "Sales Till" }, { k: "petty", l: "Petty Cash" }, { k: "transfer", l: "Move to Petty" }, { k: "deposit", l: "Bank Deposit" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: tab === t.k ? INK : "#EFE9DA", color: tab === t.k ? PAPER : INK }}>{t.l}</button>
        ))}
      </div>

      {tab === "register" && (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wide" style={{ color: INK, opacity: 0.5 }}>Sales till (today)</div>
          <Card>
            <Row label="Opening cash" value={money(opening, data.settings.currency)} />
            <Row label="+ Cash sales" value={money(cs.cashSales, data.settings.currency)} />
            <Row label="- Cash expenses" value={money(cs.cashExpenses, data.settings.currency)} />
            <Row label="- Moved to petty cash" value={money(transfersToday, data.settings.currency)} />
            <Row label="- Deposited to bank" value={money(depositsToday, data.settings.currency)} />
            <div className="h-px my-2" style={{ background: "#EAE3D3" }} />
            <Row label="Expected cash in drawer" value={money(expected, data.settings.currency)} bold />
          </Card>
          <Card>
            <Row label="Bank / card balance (est.)" value={money(bankBalance, data.settings.currency)} bold />
          </Card>
          <p className="text-xs" style={{ color: INK, opacity: 0.5 }}>This is the sales register only. Petty cash is a separate float, see the Petty Cash tab.</p>
        </div>
      )}

      {tab === "petty" && (
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-wide" style={{ color: INK, opacity: 0.5 }}>Petty cash till</div>
          <Card>
            <Row label="Petty cash balance" value={money(pettyBalance, data.settings.currency)} bold />
          </Card>
          <Field label="Type">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPettyType("expense")} className="rounded-xl py-2.5 font-medium" style={{ background: pettyType === "expense" ? RUST : "#EFE9DA", color: pettyType === "expense" ? PAPER : INK }}>Petty Expense</button>
              <button onClick={() => setPettyType("top-up")} className="rounded-xl py-2.5 font-medium" style={{ background: pettyType === "top-up" ? SAGE : "#EFE9DA", color: pettyType === "top-up" ? PAPER : INK }}>Top Up</button>
            </div>
          </Field>
          <Field label="Amount">
            <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={pettyAmt} onChange={(e) => setPettyAmt(e.target.value)} />
          </Field>
          <Field label="Description (optional)">
            <input className={inputCls} style={inputStyle} value={pettyNote} onChange={(e) => setPettyNote(e.target.value)} />
          </Field>
          <button onClick={addPetty} className="w-full rounded-2xl py-3.5 font-bold" style={{ background: BRASS, color: INK, fontFamily: FONT_DISPLAY }}>SAVE</button>

          <div className="text-xs uppercase tracking-wide mt-2" style={{ color: INK, opacity: 0.5 }}>Recent petty cash entries</div>
          {recentPettyEntries.map((a) => (
            <Card key={a.id}>
              <div className="flex justify-between items-start gap-2">
                <div className={a.voided ? "opacity-40" : ""}>
                  <div className="text-sm font-semibold" style={{ color: INK }}>
                    {a.type === "top-up" ? "Top Up" : "Petty Expense"} · {money(a.amount, data.settings.currency)}
                    {a.voided && <span className="ml-2 text-xs font-normal" style={{ color: RUST }}>DELETED</span>}
                  </div>
                  <div className="text-xs" style={{ color: INK, opacity: 0.6 }}>{a.date}{a.note ? ` · ${a.note}` : ""}</div>
                  {a.voided && a.voidReason && <div className="text-xs mt-1" style={{ color: RUST, opacity: 0.8 }}>Reason: {a.voidReason}</div>}
                </div>
                {isOwner && !a.voided && (
                  <button onClick={() => { setDeletingAdj(a); setDeleteReason(""); }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "#F6E4DC", color: RUST }}>
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "transfer" && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: INK, opacity: 0.7 }}>Moves cash out of the sales till and into the petty cash float. Use this instead of manually topping up petty cash with sales money.</p>
          <Card><Row label="Cash available in sales till" value={money(expected, data.settings.currency)} bold /></Card>
          <Field label="Amount to move">
            <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={transferAmt} onChange={(e) => setTransferAmt(e.target.value)} />
          </Field>
          {Number(transferAmt) > expected && <p className="text-sm" style={{ color: RUST }}>Amount exceeds expected cash in the sales till.</p>}
          <button onClick={doTransfer} disabled={!Number(transferAmt) || Number(transferAmt) > expected}
            className="w-full rounded-2xl py-3.5 font-bold disabled:opacity-40" style={{ background: BRASS, color: INK, fontFamily: FONT_DISPLAY }}>
            MOVE TO PETTY CASH
          </button>
        </div>
      )}

      {tab === "deposit" && (
        <div className="space-y-4">
          <Card><Row label="Cash available to deposit" value={money(expected, data.settings.currency)} bold /></Card>
          <Field label="Deposit amount">
            <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
          </Field>
          {Number(depositAmt) > expected && <p className="text-sm" style={{ color: RUST }}>Amount exceeds expected cash in the drawer.</p>}
          <button onClick={doDeposit} className="w-full rounded-2xl py-3.5 font-bold" style={{ background: SAGE, color: PAPER, fontFamily: FONT_DISPLAY }}>RECORD DEPOSIT</button>
        </div>
      )}

      {deletingAdj && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(32,36,31,0.5)" }} onClick={() => setDeletingAdj(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: PAPER }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: FONT_DISPLAY, color: INK }} className="text-lg font-bold mb-1">Delete this entry?</h3>
            <p className="text-sm mb-4" style={{ color: INK, opacity: 0.65 }}>It stays visible marked as deleted, with a reason attached, and no longer counts toward the petty cash balance.</p>
            <Field label="Reason (optional)">
              <input className={inputCls} style={inputStyle} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. entered by mistake" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={() => setDeletingAdj(null)} className="rounded-2xl py-3.5 font-semibold" style={{ background: "#EFE9DA", color: INK }}>Cancel</button>
              <button onClick={confirmDeleteAdjustment} className="rounded-2xl py-3.5 font-bold" style={{ background: RUST, color: PAPER }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   DAILY CLOSING
--------------------------------------------------------------------- */
function DailyClosing({ data, session, persist, logAudit, onBack, say }) {
  const today = todayStr();
  const existing = data.dailyClosings.find((c) => c.date === today);
  const cs = cashSummaryForDate(data, today);
  const opening = openingCashForDate(data, today);
  const expected = expectedCashForDate(data, today);

  const [actual, setActual] = useState(existing ? String(existing.actualCash) : "");
  const [reason, setReason] = useState(existing?.reason || "");

  const difference = (Number(actual) || 0) - expected;

  const closeDay = async () => {
    const closing = {
      date: today, openingCash: opening, cashSales: cs.cashSales, cardSales: cs.cardSales,
      cashExpenses: cs.cashExpenses, cardExpenses: cs.cardExpenses, expectedCash: expected,
      actualCash: Number(actual) || 0, difference, reason, closedBy: session.name, locked: true,
    };
    const filtered = data.dailyClosings.filter((c) => c.date !== today);
    const next = {
      ...data,
      dailyClosings: [...filtered, closing],
      auditLog: logAudit(data.auditLog, { action: "day_closed", details: `${today} diff ${money(difference, data.settings.currency)}` }),
    };
    await persist(next);
    say("Day closed");
    onBack();
  };

  const reopenDay = async () => {
    const closing = data.dailyClosings.find((c) => c.date === today);
    if (!closing) return;
    const next = {
      ...data,
      dailyClosings: data.dailyClosings.map((c) => c.date === today ? { ...c, locked: false } : c),
      auditLog: logAudit(data.auditLog, { action: "day_reopened", details: today }),
    };
    await persist(next);
    say("Day reopened");
  };

  const locked = isDayLocked(data, today);

  return (
    <div className="px-4 pt-4">
      <Header title="Daily Closing" onBack={onBack} />
      <div className="mt-4 space-y-3">
        <Card>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.5 }}>{niceDate(today)}</div>
          <Row label="Cash sales" value={money(cs.cashSales, data.settings.currency)} />
          <Row label="Card sales" value={money(cs.cardSales, data.settings.currency)} />
          <Row label="Total sales" value={money(cs.totalSales, data.settings.currency)} bold />
        </Card>
        <Card>
          <Row label="Cash expenses" value={money(cs.cashExpenses, data.settings.currency)} />
          <Row label="Card expenses" value={money(cs.cardExpenses, data.settings.currency)} />
          <Row label="Total expenses" value={money(cs.totalExpenses, data.settings.currency)} bold />
        </Card>
        <Card>
          <Row label="Opening cash" value={money(opening, data.settings.currency)} />
          <Row label="Moved to petty cash" value={money(tillTransfersForDate(data, today).reduce((sum, t) => sum + t.amount, 0), data.settings.currency)} />
          <Row label="Deposited to bank" value={money(bankDepositsForDate(data, today).reduce((sum, t) => sum + t.amount, 0), data.settings.currency)} />
          <Row label="Expected cash" value={money(expected, data.settings.currency)} bold />
        </Card>

        {locked ? (
          <Card>
            <Row label="Actual cash counted" value={money(existing.actualCash, data.settings.currency)} />
            <Row label="Difference" value={money(existing.difference, data.settings.currency)} bold />
            {existing.reason && <p className="text-sm mt-2" style={{ color: INK, opacity: 0.7 }}>Reason: {existing.reason}</p>}
            {session.role === "owner" && (
              <button onClick={reopenDay} className="w-full mt-4 rounded-xl py-3 font-semibold" style={{ background: "#EFE9DA", color: INK }}>Reopen Day</button>
            )}
          </Card>
        ) : (
          <>
            <Field label="How much cash is actually in the drawer?">
              <input type="number" inputMode="decimal" className={inputCls} style={inputStyle} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0.00" />
            </Field>
            {actual !== "" && (
              <Card>
                <Row label={difference < 0 ? "Cash Shortage" : difference > 0 ? "Cash Surplus" : "Balanced"} value={money(Math.abs(difference), data.settings.currency)} bold />
              </Card>
            )}
            {actual !== "" && Number(difference) !== 0 && (
              <Field label="Reason for difference (optional)">
                <input className={inputCls} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. change given incorrectly" />
              </Field>
            )}
            <button disabled={actual === ""} onClick={closeDay}
              className="w-full rounded-2xl py-4 font-bold text-lg disabled:opacity-40"
              style={{ background: INK, color: PAPER, fontFamily: FONT_DISPLAY }}>
              CONFIRM & CLOSE DAY
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   BARBERS ADMIN
--------------------------------------------------------------------- */
function BarbersAdmin({ data, persist, logAudit, onBack }) {
  const [editing, setEditing] = useState(null);

  const blank = { id: null, name: "", pin: "", active: true, compType: "commission", commissionPct: 40, fixedSalary: 0 };

  const save = async (b) => {
    let barbers;
    if (b.id) {
      barbers = data.barbers.map((x) => x.id === b.id ? b : x);
    } else {
      barbers = [...data.barbers, { ...b, id: uid("bar") }];
    }
    const next = { ...data, barbers, auditLog: logAudit(data.auditLog, { action: "barber_saved", details: b.name }) };
    await persist(next);
    setEditing(null);
  };

  const toggleActive = async (b) => {
    const next = { ...data, barbers: data.barbers.map((x) => x.id === b.id ? { ...x, active: !x.active } : x) };
    await persist(next);
  };

  if (editing) {
    return <BarberEditor barber={editing} onSave={save} onCancel={() => setEditing(null)} currency={data.settings.currency} />;
  }

  return (
    <div className="px-4 pt-4">
      <Header title="Barbers" onBack={onBack} right={
        <button onClick={() => setEditing(blank)} className="p-2 rounded-full" style={{ background: BRASS }}><Plus size={18} color={INK} /></button>
      } />
      <div className="mt-4 space-y-2">
        {data.barbers.map((b) => (
          <Card key={b.id}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold" style={{ color: INK }}>{b.name} {!b.active && <span className="text-xs" style={{ color: RUST }}>(inactive)</span>}</div>
                <div className="text-sm mt-0.5" style={{ color: INK, opacity: 0.65 }}>
                  {b.compType === "salary" && `Fixed salary ${money(b.fixedSalary, data.settings.currency)}`}
                  {b.compType === "commission" && `${b.commissionPct}% commission`}
                  {b.compType === "hybrid" && `${money(b.fixedSalary, data.settings.currency)} + ${b.commissionPct}% commission`}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(b)}><Edit2 size={16} color={INK} /></button>
                <button onClick={() => toggleActive(b)}><ShieldCheck size={16} color={b.active ? SAGE : RUST} /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BarberEditor({ barber, onSave, onCancel, currency }) {
  const [b, setB] = useState(barber);
  return (
    <div className="px-4 pt-4">
      <Header title={barber.id ? "Edit Barber" : "Add Barber"} onBack={onCancel} />
      <div className="mt-4 space-y-4">
        <Field label="Name"><input className={inputCls} style={inputStyle} value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
        <Field label="PIN (4 digits)"><input className={inputCls} style={inputStyle} value={b.pin} onChange={(e) => setB({ ...b, pin: e.target.value })} maxLength={6} /></Field>
        <Field label="Compensation type">
          <div className="grid grid-cols-3 gap-2">
            {[{ k: "commission", l: "Commission" }, { k: "salary", l: "Salary" }, { k: "hybrid", l: "Hybrid" }].map((t) => (
              <button key={t.k} onClick={() => setB({ ...b, compType: t.k })} className="rounded-xl py-2.5 text-sm font-medium" style={{ background: b.compType === t.k ? BRASS : "#EFE9DA", color: INK }}>{t.l}</button>
            ))}
          </div>
        </Field>
        {(b.compType === "commission" || b.compType === "hybrid") && (
          <Field label="Commission %"><input type="number" className={inputCls} style={inputStyle} value={b.commissionPct} onChange={(e) => setB({ ...b, commissionPct: Number(e.target.value) })} /></Field>
        )}
        {(b.compType === "salary" || b.compType === "hybrid") && (
          <Field label={`Monthly salary (${currency})`}><input type="number" className={inputCls} style={inputStyle} value={b.fixedSalary} onChange={(e) => setB({ ...b, fixedSalary: Number(e.target.value) })} /></Field>
        )}
        <button onClick={() => onSave(b)} disabled={!b.name || !b.pin} className="w-full rounded-2xl py-4 font-bold disabled:opacity-40" style={{ background: INK, color: PAPER, fontFamily: FONT_DISPLAY }}>SAVE BARBER</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SERVICES ADMIN
--------------------------------------------------------------------- */
function ServicesAdmin({ data, persist, logAudit, onBack }) {
  const [editing, setEditing] = useState(null);
  const blank = { id: null, name: "", price: "", active: true };

  const save = async (s) => {
    let services;
    if (s.id) services = data.services.map((x) => x.id === s.id ? s : x);
    else services = [...data.services, { ...s, id: uid("svc"), price: Number(s.price) }];
    const next = { ...data, services, auditLog: logAudit(data.auditLog, { action: "service_saved", details: s.name }) };
    await persist(next);
    setEditing(null);
  };

  const toggleActive = async (s) => {
    const next = { ...data, services: data.services.map((x) => x.id === s.id ? { ...x, active: !x.active } : x) };
    await persist(next);
  };

  if (editing) {
    return (
      <div className="px-4 pt-4">
        <Header title={editing.id ? "Edit Service" : "Add Service"} onBack={() => setEditing(null)} />
        <div className="mt-4 space-y-4">
          <Field label="Service name"><input className={inputCls} style={inputStyle} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
          <Field label={`Price (${data.settings.currency})`}><input type="number" className={inputCls} style={inputStyle} value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></Field>
          <button onClick={() => save(editing)} disabled={!editing.name || !editing.price} className="w-full rounded-2xl py-4 font-bold disabled:opacity-40" style={{ background: INK, color: PAPER, fontFamily: FONT_DISPLAY }}>SAVE SERVICE</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <Header title="Services" onBack={onBack} right={
        <button onClick={() => setEditing(blank)} className="p-2 rounded-full" style={{ background: BRASS }}><Plus size={18} color={INK} /></button>
      } />
      <div className="mt-4 space-y-2">
        {data.services.map((s) => (
          <Card key={s.id}>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold" style={{ color: INK }}>{s.name} {!s.active && <span className="text-xs" style={{ color: RUST }}>(inactive)</span>}</div>
                <div className="text-sm" style={{ color: BRASS }}>{money(s.price, data.settings.currency)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(s)}><Edit2 size={16} color={INK} /></button>
                <button onClick={() => toggleActive(s)}><ShieldCheck size={16} color={s.active ? SAGE : RUST} /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   REPORTS
--------------------------------------------------------------------- */
function Reports({ data, onBack, onVoidSale, onVoidExpense, say }) {
  const [tab, setTab] = useState("sales");
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidingExpenseId, setVoidingExpenseId] = useState(null);
  const [voidExpenseReason, setVoidExpenseReason] = useState("");
  const today = todayStr();
  const ym = today.slice(0, 7);
  const pnl = pnlForMonth(data, ym);

  const monthSales = data.sales.filter((s) => s.date.startsWith(ym) && s.status !== "void");
  const monthSalesAll = data.sales.filter((s) => s.date.startsWith(ym));
  const monthExpenses = data.expenses.filter((e) => e.date.startsWith(ym) && e.status !== "void");
  const monthExpensesAll = data.expenses.filter((e) => e.date.startsWith(ym));

  const salesByBarber = {};
  monthSales.forEach((s) => { salesByBarber[s.barberName] = (salesByBarber[s.barberName] || 0) + s.net; });

  const expensesByCat = {};
  monthExpenses.forEach((e) => { expensesByCat[e.category] = (expensesByCat[e.category] || 0) + Number(e.amount); });

  const confirmVoid = () => {
    onVoidSale(voidingId, voidReason.trim() || "No reason given");
    setVoidingId(null);
    setVoidReason("");
  };

  const confirmVoidExpense = () => {
    onVoidExpense(voidingExpenseId, voidExpenseReason.trim() || "No reason given");
    setVoidingExpenseId(null);
    setVoidExpenseReason("");
  };

  return (
    <div className="px-4 pt-4">
      <Header title="Reports" onBack={onBack} />
      <div className="flex gap-2 mt-4 mb-4 flex-wrap">
        {[{ k: "sales", l: "Sales" }, { k: "expenses", l: "Expenses" }, { k: "commission", l: "Commission" }, { k: "pnl", l: "P&L" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: tab === t.k ? INK : "#EFE9DA", color: tab === t.k ? PAPER : INK }}>{t.l}</button>
        ))}
      </div>
      <div className="text-xs mb-3" style={{ color: INK, opacity: 0.55 }}>Month to date · {ym}</div>

      {tab === "sales" && (
        <div className="space-y-2">
          <Card><Row label="Total net sales" value={money(pnl.netRevenue, data.settings.currency)} bold /></Card>
          <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>By barber</div>
          {Object.entries(salesByBarber).map(([name, amt]) => (
            <Card key={name}><Row label={name} value={money(amt, data.settings.currency)} /></Card>
          ))}

          <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>All sales this month</div>
          {monthSalesAll.slice().reverse().map((s) => (
            <Card key={s.id}>
              <div className="flex justify-between items-start gap-2">
                <div className={s.status === "void" ? "opacity-40" : ""}>
                  <div className="text-sm font-semibold" style={{ color: INK }}>
                    {s.serviceName} · {s.barberName}
                    {s.status === "void" && <span className="ml-2 text-xs font-normal" style={{ color: RUST }}>DELETED</span>}
                  </div>
                  <div className="text-xs" style={{ color: INK, opacity: 0.6 }}>{s.date} · {money(s.net, data.settings.currency)}</div>
                  {s.status === "void" && s.voidReason && (
                    <div className="text-xs mt-1" style={{ color: RUST, opacity: 0.8 }}>Reason: {s.voidReason}</div>
                  )}
                </div>
                {s.status !== "void" && (
                  <button onClick={() => { setVoidingId(s.id); setVoidReason(""); }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "#F6E4DC", color: RUST }}>
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}

          {monthSales.some((s) => s.attachment) && (
            <>
              <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>Sales with attachments</div>
              {monthSales.filter((s) => s.attachment).map((s) => (
                <Card key={s.id}>
                  <div className="flex justify-between items-center">
                    <div className="text-sm" style={{ color: INK }}>{s.date} · {s.serviceName} · {money(s.net, data.settings.currency)}</div>
                    <AttachmentLink attachment={s.attachment} />
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "expenses" && (
        <div className="space-y-2">
          <Card><Row label="Total expenses" value={money(monthExpenses.reduce((s, e) => s + Number(e.amount), 0), data.settings.currency)} bold /></Card>
          <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>By category</div>
          {Object.entries(expensesByCat).map(([cat, amt]) => (
            <Card key={cat}><Row label={cat} value={money(amt, data.settings.currency)} /></Card>
          ))}

          <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>All expenses this month</div>
          {monthExpensesAll.slice().reverse().map((e) => (
            <Card key={e.id}>
              <div className="flex justify-between items-start gap-2">
                <div className={e.status === "void" ? "opacity-40" : ""}>
                  <div className="text-sm font-semibold" style={{ color: INK }}>
                    {e.category} · {money(e.amount, data.settings.currency)}
                    {e.status === "void" && <span className="ml-2 text-xs font-normal" style={{ color: RUST }}>DELETED</span>}
                  </div>
                  <div className="text-xs" style={{ color: INK, opacity: 0.6 }}>{e.date}{e.description ? ` · ${e.description}` : ""}</div>
                  {e.status === "void" && e.voidReason && <div className="text-xs mt-1" style={{ color: RUST, opacity: 0.8 }}>Reason: {e.voidReason}</div>}
                </div>
                {e.status !== "void" && (
                  <button onClick={() => { setVoidingExpenseId(e.id); setVoidExpenseReason(""); }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "#F6E4DC", color: RUST }}>
                    Delete
                  </button>
                )}
              </div>
            </Card>
          ))}

          {monthExpenses.some((e) => e.attachment) && (
            <>
              <div className="text-xs uppercase tracking-wide mt-3 mb-1" style={{ color: INK, opacity: 0.5 }}>Expenses with attachments</div>
              {monthExpenses.filter((e) => e.attachment).map((e) => (
                <Card key={e.id}>
                  <div className="flex justify-between items-center">
                    <div className="text-sm" style={{ color: INK }}>{e.date} · {e.category} · {money(e.amount, data.settings.currency)}</div>
                    <AttachmentLink attachment={e.attachment} />
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "commission" && (
        <div className="space-y-2">
          {data.barbers.map((b) => (
            <Card key={b.id}>
              <div className="font-semibold mb-1" style={{ color: INK }}>{b.name}</div>
              <Row label="Sales attributed" value={money(salesByBarber[b.name] || 0, data.settings.currency)} />
              <Row label={b.compType === "salary" ? "Fixed salary" : "Commission"} value={money(pnl.commissionByBarber[b.id] || (b.compType !== "commission" ? b.fixedSalary : 0), data.settings.currency)} bold />
            </Card>
          ))}
        </div>
      )}

      {tab === "pnl" && (
        <div className="space-y-2">
          <Card>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.5 }}>Revenue</div>
            <Row label="Gross revenue" value={money(pnl.grossRevenue, data.settings.currency)} />
            <Row label="Discounts" value={`- ${money(pnl.discounts, data.settings.currency)}`} />
            <Row label="Net revenue" value={money(pnl.netRevenue, data.settings.currency)} bold />
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.5 }}>Direct costs</div>
            <Row label="Barber commissions" value={money(pnl.totalCommission, data.settings.currency)} />
            <Row label="Gross profit" value={money(pnl.grossProfit, data.settings.currency)} bold />
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: INK, opacity: 0.5 }}>Operating expenses</div>
            <Row label="Fixed salaries" value={money(pnl.fixedSalaries, data.settings.currency)} />
            <Row label="Other operating expenses" value={money(pnl.opExpenses, data.settings.currency)} />
          </Card>
          <Card>
            <Row label="Net profit" value={money(pnl.netProfit, data.settings.currency)} bold />
          </Card>
          <p className="text-xs" style={{ color: INK, opacity: 0.5 }}>Figures are month to date and update automatically as sales and expenses are entered. Use browser print for a PDF copy.</p>
        </div>
      )}

      {voidingId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(32,36,31,0.5)" }} onClick={() => setVoidingId(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: PAPER }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: FONT_DISPLAY, color: INK }} className="text-lg font-bold mb-1">Delete this sale?</h3>
            <p className="text-sm mb-4" style={{ color: INK, opacity: 0.65 }}>
              It stays in your records marked as deleted, with a reason attached, and stops counting toward totals and commission. This can't be undone from here.
            </p>
            <Field label="Reason (optional)">
              <input className={inputCls} style={inputStyle} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. entered by mistake" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={() => setVoidingId(null)} className="rounded-2xl py-3.5 font-semibold" style={{ background: "#EFE9DA", color: INK }}>Cancel</button>
              <button onClick={confirmVoid} className="rounded-2xl py-3.5 font-bold" style={{ background: RUST, color: PAPER }}>Delete Sale</button>
            </div>
          </div>
        </div>
      )}

      {voidingExpenseId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(32,36,31,0.5)" }} onClick={() => setVoidingExpenseId(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: PAPER }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: FONT_DISPLAY, color: INK }} className="text-lg font-bold mb-1">Delete this expense?</h3>
            <p className="text-sm mb-4" style={{ color: INK, opacity: 0.65 }}>
              It stays in your records marked as deleted, with a reason attached, and stops counting toward totals. This can't be undone from here.
            </p>
            <Field label="Reason (optional)">
              <input className={inputCls} style={inputStyle} value={voidExpenseReason} onChange={(e) => setVoidExpenseReason(e.target.value)} placeholder="e.g. entered by mistake" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button onClick={() => setVoidingExpenseId(null)} className="rounded-2xl py-3.5 font-semibold" style={{ background: "#EFE9DA", color: INK }}>Cancel</button>
              <button onClick={confirmVoidExpense} className="rounded-2xl py-3.5 font-bold" style={{ background: RUST, color: PAPER }}>Delete Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
   PARTNERS
--------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   AUDIT LOG
--------------------------------------------------------------------- */
const AUDIT_ACTION_LABELS = {
  sale_created: "Sale recorded",
  sale_voided: "Sale deleted",
  expense_created: "Expense recorded",
  expense_voided: "Expense deleted",
  petty_cash: "Petty cash entry",
  petty_cash_deleted: "Petty cash entry deleted",
  till_transfer: "Cash moved to petty cash",
  bank_deposit: "Bank deposit recorded",
  day_closed: "Day closed",
  day_reopened: "Day reopened",
  barber_saved: "Barber added/updated",
  service_saved: "Service added/updated",
  partner_ledger: "Partner account entry",
};

function AuditLogView({ data, onBack }) {
  const [filter, setFilter] = useState("all"); // all | deletions
  const entries = data.auditLog.slice().reverse().filter((e) =>
    filter === "all" || e.action.includes("voided") || e.action.includes("deleted"));

  return (
    <div className="px-4 pt-4">
      <Header title="Audit Log" onBack={onBack} />
      <div className="flex gap-2 mt-4 mb-4">
        {[{ k: "all", l: "All Activity" }, { k: "deletions", l: "Deletions Only" }].map((t) => (
          <button key={t.k} onClick={() => setFilter(t.k)} className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: filter === t.k ? INK : "#EFE9DA", color: filter === t.k ? PAPER : INK }}>{t.l}</button>
        ))}
      </div>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-sm" style={{ color: INK, opacity: 0.5 }}>Nothing to show yet.</p>}
        {entries.map((e) => {
          const isDeletion = e.action.includes("voided") || e.action.includes("deleted");
          const when = new Date(e.timestamp);
          return (
            <Card key={e.id}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-sm font-semibold" style={{ color: isDeletion ? RUST : INK }}>
                    {AUDIT_ACTION_LABELS[e.action] || e.action}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: INK, opacity: 0.65 }}>{e.details}</div>
                  <div className="text-xs mt-1" style={{ color: INK, opacity: 0.45 }}>{e.user} · {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PartnersView({ data, persist, logAudit, onBack, say }) {
  const today = todayStr();
  const ym = today.slice(0, 7);
  const pnl = pnlForMonth(data, ym);

  const [form, setForm] = useState({ partnerId: data.partners[0]?.id, type: "contribution", amount: "", note: "" });

  const addEntry = async () => {
    if (!Number(form.amount)) return;
    const entry = { id: uid("PL"), partnerId: form.partnerId, type: form.type, amount: Number(form.amount), date: today, note: form.note };
    const next = { ...data, partnerLedger: [...data.partnerLedger, entry], auditLog: logAudit(data.auditLog, { action: "partner_ledger", details: `${form.type} ${money(form.amount, data.settings.currency)}` }) };
    await persist(next);
    say("Recorded");
    setForm({ ...form, amount: "", note: "" });
  };

  return (
    <div className="px-4 pt-4">
      <Header title="Partner Accounts" onBack={onBack} />
      <div className="mt-4 space-y-3">
        {data.partners.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between">
              <span className="font-semibold" style={{ color: INK }}>{p.name}</span>
              <span className="text-sm" style={{ color: BRASS }}>{p.ownership}% ownership</span>
            </div>
            <Row label="Ledger balance" value={money(partnerLedgerBalance(data, p.id), data.settings.currency)} bold />
          </Card>
        ))}

        <Card>
          <Row label="Retained earnings (all time)" value={money(data.settings.retainedEarnings, data.settings.currency)} bold />
          <Row label="Net profit this month" value={money(pnl.netProfit, data.settings.currency)} />
        </Card>

        <div className="text-xs uppercase tracking-wide mt-2" style={{ color: INK, opacity: 0.5 }}>Record capital, withdrawal or distribution</div>
        <Card>
          <Field label="Partner">
            <select className={inputCls} style={inputStyle} value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
              {data.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {[{ k: "contribution", l: "Capital In" }, { k: "withdrawal", l: "Withdrawal" }, { k: "distribution", l: "Distribution" }].map((t) => (
                <button key={t.k} onClick={() => setForm({ ...form, type: t.k })} className="rounded-xl py-2 text-xs font-semibold" style={{ background: form.type === t.k ? BRASS : "#EFE9DA", color: INK }}>{t.l}</button>
              ))}
            </div>
          </Field>
          <Field label="Amount"><input type="number" className={inputCls} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Note (optional)"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <button onClick={addEntry} className="w-full rounded-2xl py-3.5 font-bold" style={{ background: INK, color: PAPER, fontFamily: FONT_DISPLAY }}>SAVE</button>
        </Card>

        <p className="text-xs" style={{ color: INK, opacity: 0.5 }}>
          Capital contributions and withdrawals are kept separate from shop revenue and expenses, as they are not trading activity. Distributions reduce cash but are not treated as an operating expense in the P&L above.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
   SETTINGS
--------------------------------------------------------------------- */
function SettingsView({ data, persist, onBack, say }) {
  const [s, setS] = useState(data.settings);
  const [partners, setPartners] = useState(data.partners);

  const save = async () => {
    const totalOwnership = partners.reduce((sum, p) => sum + Number(p.ownership), 0);
    const next = { ...data, settings: s, partners };
    await persist(next);
    say(totalOwnership === 100 ? "Settings saved" : "Settings saved (ownership does not total 100%)");
  };

  return (
    <div className="px-4 pt-4">
      <Header title="Settings" onBack={onBack} />
      <div className="mt-4 space-y-4">
        <Field label="Shop name"><input className={inputCls} style={inputStyle} value={s.shopName} onChange={(e) => setS({ ...s, shopName: e.target.value })} /></Field>
        <Field label="Address"><input className={inputCls} style={inputStyle} value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
        <Field label="Phone"><input className={inputCls} style={inputStyle} value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></Field>
        <Field label="Currency code"><input className={inputCls} style={inputStyle} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></Field>
        <Field label="Default opening cash"><input type="number" className={inputCls} style={inputStyle} value={s.openingCashDefault} onChange={(e) => setS({ ...s, openingCashDefault: Number(e.target.value) })} /></Field>

        <Field label="VAT">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button onClick={() => setS({ ...s, vatEnabled: true })} className="rounded-xl py-2.5 font-medium" style={{ background: s.vatEnabled ? BRASS : "#EFE9DA", color: INK }}>Enabled</button>
            <button onClick={() => setS({ ...s, vatEnabled: false })} className="rounded-xl py-2.5 font-medium" style={{ background: !s.vatEnabled ? BRASS : "#EFE9DA", color: INK }}>Disabled</button>
          </div>
          {s.vatEnabled && <input type="number" className={inputCls} style={inputStyle} value={s.vatRate} onChange={(e) => setS({ ...s, vatRate: Number(e.target.value) })} placeholder="VAT rate %" />}
        </Field>

        <div className="text-xs uppercase tracking-wide" style={{ color: INK, opacity: 0.5 }}>Partner ownership</div>
        {partners.map((p, i) => (
          <div key={p.id} className="grid grid-cols-3 gap-2 items-center">
            <input className={`${inputCls} col-span-2`} style={inputStyle} value={p.name} onChange={(e) => { const next = [...partners]; next[i] = { ...p, name: e.target.value }; setPartners(next); }} />
            <input type="number" className={inputCls} style={inputStyle} value={p.ownership} onChange={(e) => { const next = [...partners]; next[i] = { ...p, ownership: Number(e.target.value) }; setPartners(next); }} />
          </div>
        ))}
        <p className="text-xs" style={{ color: INK, opacity: 0.5 }}>Ownership percentages should total 100%. Changing this only affects future distributions, not historical ones already recorded.</p>

        <button onClick={save} className="w-full rounded-2xl py-4 font-bold" style={{ background: SAGE, color: PAPER, fontFamily: FONT_DISPLAY }}>SAVE SETTINGS</button>
      </div>
    </div>
  );
}
