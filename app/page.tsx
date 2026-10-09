"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  Ticket as TicketIcon,
  Plus,
  Search,
  MapPin,
  Pencil,
  Trash2,
  ArrowLeft,
  Upload,
  X,
  LogOut,
  LoaderCircle,
  ScanBarcode,
  ArrowUpRight,
  RefreshCw,
  Copy,
  Sun,
  Moon,
  StarCheck,
} from "lucide-react";
import dynamic from "next/dynamic";

type Ticket = {
  id: string;
  user_id: string;
  event_name: string;
  event_date: string;
  venue: string;
  location: string | null;
  ticket_type: string | null;
  quantity: number;
  order_number: string | null;
  section: string | null;
  seat_row: string | null;
  seat_number: string | null;
  image_path: string | null;
  transferred_to: string | null;
  transfer_contact: string | null;
  transfer_note: string | null;
  transferred_at: string | null;
  created_at: string;
};

type TicketForm = {
  event_name: string;
  event_date: string;
  venue: string;
  location: string;
  ticket_type: string;
  quantity: string;
  order_number: string;
  section: string;
  seat_row: string;
  seat_number: string;
};

type TransferForm = {
  first_name: string;
  last_name: string;
  contact: string;
  note: string;
};

const emptyForm: TicketForm = {
  event_name: "",
  event_date: "",
  venue: "",
  location: "",
  ticket_type: "",
  quantity: "1",
  order_number: "",
  section: "",
  seat_row: "",
  seat_number: "",
};

const emptyTransfer: TransferForm = {
  first_name: "",
  last_name: "",
  contact: "",
  note: "",
};

const BUCKET = "ticket-images";

// Theme (taken from the screenshots)
const DARK = "bg-[#26262b]";
const BLUE = "bg-[#1f4fd8] hover:bg-[#1a43b8]";
const GRAY = "bg-[var(--gray)]";
const INPUT =
  "w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] p-3 text-(--text) outline-none placeholder:text-[var(--placeholder)] focus:border-[#1f4fd8]";

type Theme = "light" | "dark";

// Every surface colour reads from these CSS variables, so switching theme
// only swaps this object (no Tailwind dark-mode config needed).
const THEMES: Record<Theme, CSSProperties> = {
  light: {
    "--bg": "#ffffff",
    "--surface": "#ffffff",
    "--text": "#0f172a",
    "--muted": "#64748b",
    "--border": "#cbd5e1",
    "--input-bg": "#f1f5f9",
    "--input-border": "#94a3b8",
    "--placeholder": "#94a3b8",
    "--gray": "#e4e4e7",
    "--hover": "#f8fafc",
    "--tab": "#26262b",
    "--err-bg": "#fef2f2",
    "--err-text": "#b91c1c",
    "--login-bg": "#26262b",
  } as CSSProperties,
  dark: {
    "--bg": "#0f0f11",
    "--surface": "#1b1b1f",
    "--text": "#f4f4f5",
    "--muted": "#a1a1aa",
    "--border": "#3a3a40",
    "--input-bg": "#26262b",
    "--input-border": "#52525b",
    "--placeholder": "#71717a",
    "--gray": "#26262b",
    "--hover": "#2a2a30",
    "--tab": "#ffffff",
    "--err-bg": "#3b1414",
    "--err-text": "#fca5a5",
    "--login-bg": "#0b0b0d",
  } as CSSProperties,
};

// Converts a stored ISO timestamp into the local value a datetime-local input expects.
function toInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// "SAT • AUG 28, 2027 • 5:00 PM"
function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "DATE UNAVAILABLE";

  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("weekday")} • ${get("month")} ${get("day")}, ${get(
    "year",
  )} • ${get("hour")}:${get("minute")} ${get("dayPeriod")}`.toUpperCase();
}

function venueLabel(ticket: Ticket) {
  return [ticket.venue, ticket.location].filter(Boolean).join(", ");
}

const VenueMap = dynamic(() => import("@/components/VenueMap"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse bg-(--input-bg) sm:h-80" />
  ),
});

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [page, setPage] = useState<"list" | "form" | "details">("list");
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [form, setForm] = useState<TicketForm>(emptyForm);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState<TransferForm>(emptyTransfer);
  const [orderCopied, setOrderCopied] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";

    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      /* storage unavailable */
    }

    return saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const ticketsRef = useRef<HTMLDivElement>(null);

  async function loadTickets() {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("event_date", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    setTickets((data ?? []) as Ticket[]);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        await loadTickets();
      }

      if (active) setLoading(false);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            if (active) void loadTickets();
          }, 0);
        } else {
          setTickets([]);
          setSelected(null);
          setPage("list");
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Keep native controls (date picker, scrollbars) and the page edge in sync.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor =
      theme === "dark" ? "#0f0f11" : "#ffffff";
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable */
    }
  }

  function imageUrl(ticket: Ticket) {
    if (!ticket.image_path) return "";

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(ticket.image_path);

    return data.publicUrl;
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setImage(null);
    setPreview("");
    setError("");
    setPage("form");
  }

  function openEdit(ticket: Ticket) {
    setEditing(ticket);
    setForm({
      event_name: ticket.event_name,
      event_date: toInputValue(ticket.event_date),
      venue: ticket.venue,
      location: ticket.location ?? "",
      ticket_type: ticket.ticket_type ?? "",
      quantity: String(ticket.quantity ?? 1),
      order_number: ticket.order_number ?? "",
      section: ticket.section ?? "",
      seat_row: ticket.seat_row ?? "",
      seat_number: ticket.seat_number ?? "",
    });
    setImage(null);
    setPreview(imageUrl(ticket));
    setError("");
    setPage("form");
  }

  function openDetails(ticket: Ticket) {
    setSelected(ticket);
    setPage("details");
    setError("");
    window.scrollTo({ top: 0 });
  }

  function handleImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5 MB.");
      return;
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setError("");
  }

  async function saveTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError("");

    let imagePath = editing?.image_path ?? null;
    let uploadedPath: string | null = null;

    try {
      if (image) {
        const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, image, {
            contentType: image.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        imagePath = path;
        uploadedPath = path;
      }

      const quantity = Math.max(1, parseInt(form.quantity, 10) || 1);

      const payload = {
        event_name: form.event_name.trim(),
        event_date: new Date(form.event_date).toISOString(),
        venue: form.venue.trim(),
        location: form.location.trim() || null,
        ticket_type: form.ticket_type.trim() || null,
        quantity,
        order_number: form.order_number.trim() || null,
        section: form.section.trim() || null,
        seat_row: form.seat_row.trim() || null,
        seat_number: form.seat_number.trim() || null,
        image_path: imagePath,
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error: updateError } = await supabase
          .from("tickets")
          .update(payload)
          .eq("id", editing.id)
          .eq("user_id", user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("tickets")
          .insert({ ...payload, user_id: user.id });

        if (insertError) throw insertError;
      }

      if (image && editing?.image_path && editing.image_path !== imagePath) {
        await supabase.storage.from(BUCKET).remove([editing.image_path]);
      }

      await loadTickets();
      setSelected(null);
      setPage("list");
      setEditing(null);
      setImage(null);
      setPreview("");
    } catch (err) {
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      setError(err instanceof Error ? err.message : "Unable to save ticket.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTicket(ticket: Ticket) {
    if (!user || !window.confirm(`Delete "${ticket.event_name}"?`)) return;

    setError("");

    const { error: deleteError } = await supabase
      .from("tickets")
      .delete()
      .eq("id", ticket.id)
      .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    if (ticket.image_path) {
      await supabase.storage.from(BUCKET).remove([ticket.image_path]);
    }

    setTickets((previous) => previous.filter((item) => item.id !== ticket.id));

    if (selected?.id === ticket.id) {
      setSelected(null);
      setPage("list");
    }
  }

  async function submitTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !selected) return;

    setSaving(true);
    setError("");

    const changes = {
      transferred_to:
        `${transfer.first_name.trim()} ${transfer.last_name.trim()}`.trim(),
      transfer_contact: transfer.contact.trim(),
      transfer_note: transfer.note.trim() || null,
      transferred_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("tickets")
      .update(changes)
      .eq("id", selected.id)
      .eq("user_id", user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    const updated = { ...selected, ...changes } as Ticket;
    setSelected(updated);
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setTransfer(emptyTransfer);
    setTransferOpen(false);
  }

  async function copyOrder(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setOrderCopied(true);
      setTimeout(() => setOrderCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result =
        authMode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      if (authMode === "signup" && !result.data.session) {
        setError("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = tickets.filter((ticket) =>
    `${ticket.event_name} ${ticket.venue} ${ticket.location ?? ""} ${
      ticket.ticket_type ?? ""
    } ${ticket.section ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const themeStyle = THEMES[theme];

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      className="flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      <span className="hidden sm:inline">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );

  if (loading) {
    return (
      <div
        style={themeStyle}
        className="flex min-h-screen items-center justify-center bg-(--bg)"
      >
        <LoaderCircle className="animate-spin text-[#1f4fd8]" />
      </div>
    );
  }

  if (!user) {
    return (
      <main
        style={themeStyle}
        className="relative flex min-h-screen items-center justify-center bg-(--login-bg) p-5 text-(--text)"
      >
        <div className="absolute right-4 top-4">{themeButton}</div>
        <form
          onSubmit={authenticate}
          className="w-full max-w-md rounded-lg bg-(--surface) p-8 shadow-xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="rounded-md bg-[#1f4fd8] p-3 text-white">
              <TicketIcon />
            </span>
            <div>
              <h1 className="text-2xl font-black text-(--text) italic">
                ticketmaster
              </h1>
              <p className="text-sm text-(--muted)">
                Your personal ticket collection
              </p>
            </div>
          </div>

          <h2 className="mb-2 text-xl font-bold">
            {authMode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mb-6 text-sm text-(--muted)">
            Sign in to manage your saved tickets.
          </p>

          <label className="mb-2 block text-sm font-bold">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${INPUT} mb-4`}
            placeholder="you@example.com"
          />

          <label className="mb-2 block text-sm font-bold">Password</label>
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${INPUT} mb-4`}
            placeholder="At least 6 characters"
          />

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            className={`w-full rounded-md ${BLUE} p-3 font-bold uppercase tracking-wide text-white`}
          >
            {authMode === "login" ? "Sign In" : "Create Account"}
          </button>

          <button
            type="button"
            onClick={() =>
              setAuthMode(authMode === "login" ? "signup" : "login")
            }
            className="mt-5 w-full text-sm font-semibold text-[#1f4fd8]"
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already registered? Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div style={themeStyle} className="min-h-screen bg-(--bg) text-(--text)">
      <header className={`sticky top-0 z-20 ${DARK} text-white`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <button
            onClick={() => {
              setPage("list");
              setSelected(null);
            }}
            className="flex items-center gap-3"
          >
            <span className="rounded-md bg-[#1f4fd8] p-2 text-white">
              <TicketIcon size={22} />
            </span>
            <span className="text-xl font-black tracking-tight italic">
              ticketmaster
            </span>
          </button>

          <div className="hidden items-center gap-7 text-sm font-semibold md:flex">
            <button
              onClick={() => {
                setPage("list");
                setSelected(null);
              }}
              className={
                page === "list"
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              }
            >
              My Tickets
            </button>
            <button
              onClick={openAdd}
              className={
                page === "form"
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              }
            >
              Add Ticket
            </button>
          </div>

          <div className="flex items-center gap-2">
            {themeButton}
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold hover:bg-white/10"
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main
        className={
          page === "details"
            ? ""
            : "mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12"
        }
      >
        {/* ───────────── LIST ───────────── */}
        {page === "list" && (
          <>
            <section className="mb-10">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                My Tickets
              </h1>
              <p className="mt-2 text-sm text-(--muted)">
                {tickets.length} saved{" "}
                {tickets.length === 1 ? "event" : "events"}
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-md border border-(--border) bg-(--input-bg) px-3 py-3 sm:max-w-sm">
                  <Search size={18} className="text-(--muted)" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your tickets"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <button
                  onClick={openAdd}
                  className={`flex items-center gap-2 rounded-md ${BLUE} px-4 py-3 text-sm font-bold text-white`}
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Add Ticket</span>
                </button>
              </div>
            </section>

            {error && (
              <p className="mb-5 rounded-md bg-(--err-bg) p-3 text-sm text-(--err-text)">
                {error}
              </p>
            )}

            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-(--border) px-5 py-16 text-center">
                <TicketIcon className="mx-auto mb-4 text-(--muted)" size={48} />
                <h3 className="text-lg font-bold">
                  {search
                    ? "No matching tickets"
                    : "Your collection starts here"}
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-(--muted)">
                  {search
                    ? "Try a different event name or venue."
                    : "Add your first event and keep its seat details handy."}
                </p>
                {!search && (
                  <button
                    onClick={openAdd}
                    className={`mt-5 rounded-md ${BLUE} px-5 py-3 font-bold text-white`}
                  >
                    Add your first ticket
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="overflow-hidden rounded-lg bg-(--surface) shadow-md ring-1 ring-(--border) transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <button
                      onClick={() => openDetails(ticket)}
                      className="block w-full text-left"
                    >
                      <div className="relative">
                        {ticket.image_path ? (
                          <Image
                            src={imageUrl(ticket)}
                            alt={ticket.event_name}
                            width={960}
                            height={384}
                            loading="eager"
                            unoptimized
                            className="h-48 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-48 items-center justify-center bg-linear-to-br from-[#26262b] to-[#0f0f12] text-white">
                            <TicketIcon size={56} />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-0 left-0 ${DARK} px-3 py-2 text-xs font-bold tracking-wide text-white`}
                        >
                          {dateLabel(ticket.event_date)}
                        </span>
                      </div>

                      <div className={`${DARK} p-5 text-white`}>
                        <h3 className="text-lg font-extrabold uppercase leading-snug">
                          {ticket.event_name}
                        </h3>
                        <div className="mt-3 flex items-end justify-between gap-3 text-sm text-slate-300">
                          <span className="flex items-start gap-2">
                            <MapPin size={16} className="mt-0.5 shrink-0" />
                            {venueLabel(ticket)}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 font-bold text-white">
                            <TicketIcon size={18} />x{ticket.quantity}
                          </span>
                        </div>
                        {ticket.transferred_to && (
                          <p className="mt-3 rounded bg-white/10 px-2 py-1 text-xs text-slate-200">
                            Transferred to {ticket.transferred_to}
                          </p>
                        )}
                      </div>
                    </button>

                    <div className="flex gap-2 p-4">
                      <button
                        onClick={() => openDetails(ticket)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-md ${BLUE} px-3 py-2.5 text-sm font-bold text-white`}
                      >
                        <ScanBarcode size={17} /> View Tickets
                      </button>
                      <button
                        aria-label={`Edit ${ticket.event_name}`}
                        onClick={() => openEdit(ticket)}
                        className="rounded-md border border-(--border) p-2.5 hover:bg-(--hover)"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        aria-label={`Delete ${ticket.event_name}`}
                        onClick={() => deleteTicket(ticket)}
                        className="rounded-md border border-(--border) p-2.5 text-red-600 hover:bg-(--err-bg)"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {/* ───────────── FORM ───────────── */}
        {page === "form" && (
          <section className="mx-auto max-w-2xl">
            <button
              onClick={() => setPage("list")}
              className="mb-6 flex items-center gap-2 text-sm font-bold text-(--muted)"
            >
              <ArrowLeft size={18} /> Back to My Tickets
            </button>

            <div className="rounded-lg border border-(--border) bg-(--surface) p-6 shadow-sm sm:p-9">
              <h1 className="text-2xl font-black">
                {editing ? "Edit Ticket" : "Add Ticket"}
              </h1>
              <p className="mt-2 text-sm text-(--muted)">
                Enter the event details and upload your image.
              </p>

              <form onSubmit={saveTicket} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Event image
                  </label>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    onChange={handleImage}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-(--border) bg-(--input-bg) p-5 text-center hover:border-[#1f4fd8]"
                  >
                    {preview ? (
                      <Image
                        src={preview}
                        alt="Event preview"
                        width={1200}
                        height={600}
                        className="max-h-64 w-full rounded-md object-cover"
                      />
                    ) : (
                      <>
                        <Upload className="mb-3 text-[#1f4fd8]" size={30} />
                        <span className="font-bold">Upload event image</span>
                        <span className="mt-1 text-xs text-(--muted)">
                          JPG, PNG, or WebP, maximum 5 MB
                        </span>
                      </>
                    )}
                  </button>
                  {preview && (
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setPreview("");
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                      className="mt-2 flex items-center gap-1 text-sm text-red-600"
                    >
                      <X size={15} /> Remove selected image
                    </button>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Event name *
                  </label>
                  <input
                    required
                    maxLength={200}
                    value={form.event_name}
                    onChange={(e) =>
                      setForm({ ...form, event_name: e.target.value })
                    }
                    placeholder="e.g. Harry Styles: Together, Together"
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Date and time *
                  </label>
                  <input
                    required
                    type="datetime-local"
                    value={form.event_date}
                    onChange={(e) =>
                      setForm({ ...form, event_date: e.target.value })
                    }
                    className={INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Venue *
                    </label>
                    <input
                      required
                      maxLength={200}
                      value={form.venue}
                      onChange={(e) =>
                        setForm({ ...form, venue: e.target.value })
                      }
                      placeholder="e.g. Wembley Stadium"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Venue address or city
                    </label>
                    <input
                      maxLength={200}
                      value={form.location}
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                      placeholder="e.g. Madison Square Garden, New York, NY"
                      className={INPUT}
                    />
                    <p className="mt-2 text-xs text-(--muted)">
                      Tip: Enter the full street address or venue name plus city
                      and country for a more accurate map pin.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-bold">
                      Ticket type
                    </label>
                    <input
                      maxLength={100}
                      value={form.ticket_type}
                      onChange={(e) =>
                        setForm({ ...form, ticket_type: e.target.value })
                      }
                      placeholder="e.g. General Admission Pit"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Quantity *
                    </label>
                    <input
                      required
                      type="number"
                      min={1}
                      max={20}
                      value={form.quantity}
                      onChange={(e) =>
                        setForm({ ...form, quantity: e.target.value })
                      }
                      className={INPUT}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Order number
                  </label>
                  <input
                    maxLength={100}
                    value={form.order_number}
                    onChange={(e) =>
                      setForm({ ...form, order_number: e.target.value })
                    }
                    placeholder="e.g. 12-34567/LON"
                    className={INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Section
                    </label>
                    <input
                      maxLength={50}
                      value={form.section}
                      onChange={(e) =>
                        setForm({ ...form, section: e.target.value })
                      }
                      placeholder="GA"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold">Row</label>
                    <input
                      maxLength={50}
                      value={form.seat_row}
                      onChange={(e) =>
                        setForm({ ...form, seat_row: e.target.value })
                      }
                      placeholder="GENERAL ADMISSION"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Seat number
                    </label>
                    <input
                      maxLength={50}
                      value={form.seat_number}
                      onChange={(e) =>
                        setForm({ ...form, seat_number: e.target.value })
                      }
                      placeholder="Leave empty for GA"
                      className={INPUT}
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-md bg-[var(--err-bg)] p-3 text-sm text-[var(--err-text)]">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setPage("list")}
                    className="flex-1 rounded-md border border-[var(--border)] px-4 py-3 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    className={`flex-1 rounded-md ${BLUE} px-4 py-3 font-bold text-white disabled:opacity-60`}
                  >
                    {saving
                      ? "Saving..."
                      : editing
                        ? "Save Changes"
                        : "Save Ticket"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* ───────────── DETAILS ───────────── */}
        {page === "details" && selected && (
          <section className="mx-auto max-w-3xl pb-32">
            <div className="relative h-72 sm:h-96">
              {selected.image_path ? (
                <Image
                  src={imageUrl(selected)}
                  alt={selected.event_name}
                  fill
                  sizes="(max-width: 640px) 100vw, 768px"
                  unoptimized
                  className="object-cover object-top"
                  loading="eager"
                />
              ) : (
                <div className="flex h-72 items-center justify-center bg-linear-to-br from-[#26262b] to-black text-white sm:h-96">
                  <TicketIcon size={76} />
                </div>
              )}
              <button
                onClick={() => setPage("list")}
                aria-label="Back to My Tickets"
                className="absolute left-4 top-4 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
              >
                <ArrowLeft size={22} />
              </button>
              <button
                onClick={() => openEdit(selected)}
                className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/60"
              >
                <StarCheck size={15} />
              </button>
              <span
                className={`absolute bottom-0 left-0 ${DARK} px-4 py-3 text-sm font-bold tracking-wide text-white`}
              >
                {dateLabel(selected.event_date)}
              </span>
            </div>

            <div className={`${DARK} px-5 pb-6 pt-5 text-white sm:px-6`}>
              <h1 className="text-2xl font-black uppercase leading-tight sm:text-3xl">
                {selected.event_name}
              </h1>
              <div className="mt-5 flex items-center justify-between gap-4 text-slate-300">
                <p>{venueLabel(selected)}</p>
                <span className="flex shrink-0 items-center gap-2 font-bold text-white">
                  <TicketIcon size={22} /> x{selected.quantity}
                </span>
              </div>
            </div>

            <button
              onClick={() =>
                ticketsRef.current?.scrollIntoView({ behavior: "smooth" })
              }
              className={`flex w-full items-center justify-center gap-2 ${BLUE} py-4 font-bold text-white`}
            >
              <ScanBarcode size={22} /> View Tickets
            </button>

            <div className="border-b border-[var(--border)]">
              <div className="flex">
                <span className="flex-1 border-b-4 border-[var(--tab)] py-4 text-center font-bold">
                  Tickets
                </span>
              </div>
            </div>

            <div ref={ticketsRef} className="px-5 pt-6 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                    Order #{" "}
                    {selected.order_number ? (
                      <>
                        <span className="break-all">
                          {selected.order_number}
                        </span>
                        <button
                          onClick={() => copyOrder(selected.order_number!)}
                          aria-label="Copy order number"
                          className="text-(--muted) hover:text-(--text)"
                        >
                          <Copy size={16} />
                        </button>
                        {orderCopied && (
                          <span className="text-xs font-normal text-green-600">
                            Copied
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-(--muted)">—</span>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-(--muted)">
                    x{selected.quantity}{" "}
                    {selected.quantity === 1 ? "Ticket" : "Tickets"}
                  </p>
                </div>
                <button
                  onClick={() => deleteTicket(selected)}
                  aria-label="Delete ticket"
                  className="rounded-md p-2 text-red-600 hover:bg-[var(--err-bg)]"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {selected.transferred_to && (
                <div className="mt-5 rounded-md border border-[#1f4fd8]/30 bg-[#1f4fd8]/5 p-4 text-sm">
                  <p className="font-bold text-[#1f4fd8]">
                    Transferred to {selected.transferred_to}
                  </p>
                  <p className="mt-1 text-(--muted)">
                    {selected.transfer_contact}
                  </p>
                  {selected.transfer_note && (
                    <p className="mt-1 italic text-(--muted)">
                      “{selected.transfer_note}”
                    </p>
                  )}
                  {selected.transferred_at && (
                    <p className="mt-1 text-xs text-(--muted)">
                      {new Date(selected.transferred_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {Array.from({ length: selected.quantity || 1 }).map((_, i) => (
                  <div key={i}>
                    <div
                      className={`${GRAY} px-5 py-5 font-semibold text-(--text)`}
                    >
                      {selected.ticket_type || "General Admission"}
                    </div>
                    <div
                      className={`${GRAY} mt-0.5 grid grid-cols-[1fr_2fr_1fr] gap-3 px-5 py-5`}
                    >
                      <div>
                        <p className="text-xs font-semibold tracking-wide text-(--muted)">
                          SECTION
                        </p>
                        <p className="mt-1 font-bold text-(--text)">
                          {selected.section || "-"}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold tracking-wide text-(--muted)">
                          ROW
                        </p>
                        <p className="mt-1 font-bold text-(--text)">
                          {selected.seat_row || "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold tracking-wide text-(--muted)">
                          SEAT
                        </p>
                        <p className="mt-1 font-bold text-(--text)">
                          {selected.seat_number
                            ? /^\d+$/.test(selected.seat_number.trim())
                              ? String(Number(selected.seat_number) + i)
                              : selected.seat_number
                            : i + 1}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Venue map */}

            {/* More options + venue map */}
            <div className="px-5 pt-10 sm:px-6">
              <h2 className="text-lg font-black uppercase tracking-wide">
                More Options
              </h2>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="font-bold text-(--text)">{selected.venue}</h2>

                  <p className="mt-1 flex items-start gap-2 text-sm text-(--muted)">
                    <MapPin size={16} className="mt-0.5 shrink-0" />

                    <span>{selected.location || "Location not provided"}</span>
                  </p>
                </div>

                <MapPin size={22} className="shrink-0 text-[#1f4fd8]" />
              </div>
              {selected.venue.trim() ? (
                <VenueMap venue={selected.venue} location={selected.location} />
              ) : (
                <div className="px-4 pb-4 text-sm text-(--muted)">
                  Add a venue name to display its location on the map.
                </div>
              )}
            </div>

            {/* Floating Transfer / Sell pill */}
            <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center">
              <div className="flex overflow-hidden rounded-full bg-[var(--surface)] shadow-[0_8px_30px_rgba(0,0,0,0.25)] ring-1 ring-[var(--border)]">
                <button
                  onClick={() => {
                    setTransfer(emptyTransfer);
                    setError("");
                    setTransferOpen(true);
                  }}
                  disabled={!!selected.transferred_to}
                  className="flex w-28 flex-col items-center gap-1 px-4 py-3 text-sm font-semibold text-(--text) hover:bg-[var(--hover)] disabled:opacity-40"
                >
                  <ArrowUpRight size={22} className="text-[#1f4fd8]" />
                  Transfer
                </button>
                <button
                  disabled
                  className="flex w-28 cursor-not-allowed flex-col items-center gap-1 border-l border-[var(--border)] px-4 py-3 text-sm font-semibold text-(--muted) opacity-60"
                >
                  <RefreshCw size={22} />
                  Sell
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ───────────── TRANSFER SHEET ───────────── */}
      {transferOpen && selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center">
          <form
            onSubmit={submitTransfer}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] sm:rounded-2xl"
          >
            <div className="border-b border-[var(--border)] py-3 text-center text-xs font-semibold tracking-wide text-(--text)">
              TRANSFER TICKETS
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <p>
                {selected.quantity}{" "}
                {selected.quantity === 1 ? "Ticket" : "Tickets"} Selected
                <br />
                Sec <b>{selected.section || "-"}</b> Row{" "}
                <b>{selected.seat_row || "-"}</b> Seat{" "}
                {selected.seat_number || ""}
              </p>

              <div>
                <label className="mb-2 block font-bold text-(--text)">
                  First Name
                </label>
                <input
                  required
                  value={transfer.first_name}
                  onChange={(e) =>
                    setTransfer({ ...transfer, first_name: e.target.value })
                  }
                  placeholder="First Name"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="mb-2 block font-bold text-(--text)">
                  Last Name
                </label>
                <input
                  required
                  value={transfer.last_name}
                  onChange={(e) =>
                    setTransfer({ ...transfer, last_name: e.target.value })
                  }
                  placeholder="Last Name"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="mb-2 block font-bold text-(--text)">
                  Email or Mobile Number
                </label>
                <input
                  required
                  value={transfer.contact}
                  onChange={(e) =>
                    setTransfer({ ...transfer, contact: e.target.value })
                  }
                  placeholder="Email or Mobile Number"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="mb-2 block font-bold text-(--text)">
                  Note
                </label>
                <textarea
                  rows={3}
                  value={transfer.note}
                  onChange={(e) =>
                    setTransfer({ ...transfer, note: e.target.value })
                  }
                  placeholder="Note"
                  className={INPUT}
                />
              </div>

              {error && (
                <p className="rounded-md bg-[var(--err-bg)] p-3 text-sm text-[var(--err-text)]">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="text-sm font-semibold text-[#1f4fd8]"
              >
                &lt; BACK
              </button>
              <button
                disabled={saving}
                className={`rounded-sm ${BLUE} px-5 py-3 text-sm font-semibold uppercase text-white disabled:opacity-60`}
              >
                {saving
                  ? "Transferring..."
                  : `Transfer ${selected.quantity} ${selected.quantity === 1 ? "Ticket" : "Tickets"}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
