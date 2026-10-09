"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import {
  Ticket as TicketIcon,
  Plus,
  Search,
  CalendarDays,
  MapPin,
  Pencil,
  Trash2,
  ArrowLeft,
  Upload,
  X,
  LogOut,
  LoaderCircle,
} from "lucide-react";

type Ticket = {
  id: string;
  user_id: string;
  event_name: string;
  event_date: string;
  venue: string;
  section: string | null;
  seat_row: string | null;
  seat_number: string | null;
  image_path: string | null;
  created_at: string;
};

type TicketForm = {
  event_name: string;
  event_date: string;
  venue: string;
  section: string;
  seat_row: string;
  seat_number: string;
};

const emptyForm: TicketForm = {
  event_name: "",
  event_date: "",
  venue: "",
  section: "",
  seat_row: "",
  seat_number: "",
};

const BUCKET = "ticket-images";

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
  const fileInput = useRef<HTMLInputElement>(null);

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

  function imageUrl(ticket: Ticket) {
    if (!ticket.image_path) return "";

    const { data } = supabase.storage
      .from("ticket-images")
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
      event_date: ticket.event_date.slice(0, 16),
      venue: ticket.venue,
      section: ticket.section ?? "",
      seat_row: ticket.seat_row ?? "",
      seat_number: ticket.seat_number ?? "",
    });
    setImage(null);
    setPreview(imageUrl(ticket));
    setError("");
    setPage("form");
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

      const payload = {
        event_name: form.event_name.trim(),
        event_date: new Date(form.event_date).toISOString(),
        venue: form.venue.trim(),
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
    `${ticket.event_name} ${ticket.venue} ${ticket.section ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function dateLabel(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Nairobi",
    }).format(date);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
        <form
          onSubmit={authenticate}
          className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="rounded-xl bg-blue-600 p-3 text-white">
              <TicketIcon />
            </span>
            <div>
              <h1 className="text-2xl font-black text-slate-950">TicketHub</h1>
              <p className="text-sm text-slate-500">
                Your personal ticket collection
              </p>
            </div>
          </div>

          <h2 className="mb-2 text-xl font-bold">
            {authMode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            Sign in to manage your saved tickets.
          </p>

          <label className="mb-2 block text-sm font-semibold">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-xl border p-3 outline-none focus:border-blue-500"
            placeholder="you@example.com"
          />

          <label className="mb-2 block text-sm font-semibold">Password</label>
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-xl border p-3 outline-none focus:border-blue-500"
            placeholder="At least 6 characters"
          />

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white hover:bg-blue-700">
            {authMode === "login" ? "Sign In" : "Create Account"}
          </button>

          <button
            type="button"
            onClick={() =>
              setAuthMode(authMode === "login" ? "signup" : "login")
            }
            className="mt-5 w-full text-sm font-semibold text-blue-700"
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already registered? Sign in"}
          </button>

          {error && authMode === "signup" && (
            <p className="mt-3 text-center text-sm text-slate-500">{error}</p>
          )}
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <button
            onClick={() => {
              setPage("list");
              setSelected(null);
            }}
            className="flex items-center gap-3"
          >
            <span className="rounded-xl bg-blue-600 p-2.5 text-white">
              <TicketIcon size={23} />
            </span>
            <span className="text-xl font-black tracking-tight">
              TicketHub<span className="text-blue-600">.</span>
            </span>
          </button>

          <div className="hidden items-center gap-7 text-sm font-semibold md:flex">
            <button onClick={() => setPage("list")} className="text-blue-700">
              My Tickets
            </button>
            <button onClick={openAdd} className="hover:text-blue-700">
              Add Ticket
            </button>
          </div>

          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            <LogOut size={17} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        {page === "list" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-blue-700 px-6 py-10 text-white sm:px-10 sm:py-14">
              <div className="relative z-10 max-w-2xl">
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-blue-200">
                  Your events, all in one place
                </p>
                <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                  Your next great memory starts here.
                </h1>
                <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100 sm:text-base">
                  Keep your event details, seat assignments, and images
                  organized in your personal ticket collection.
                </p>
                <button
                  onClick={openAdd}
                  className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-blue-700 transition hover:bg-blue-50"
                >
                  <Plus size={19} /> Add a ticket
                </button>
              </div>
              <TicketIcon
                className="absolute -right-8 -top-8 rotate-12 text-blue-600/70"
                size={240}
              />
            </section>

            <section className="mt-10">
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-2xl font-black">My Tickets</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {tickets.length} saved{" "}
                    {tickets.length === 1 ? "ticket" : "tickets"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2.5 sm:w-72">
                    <Search size={18} className="text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search your tickets"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                  <button
                    onClick={openAdd}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">Add Ticket</span>
                  </button>
                </div>
              </div>

              {error && (
                <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-dashed bg-white px-5 py-16 text-center">
                  <TicketIcon
                    className="mx-auto mb-4 text-slate-300"
                    size={48}
                  />
                  <h3 className="text-lg font-bold">
                    {search
                      ? "No matching tickets"
                      : "Your collection starts here"}
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                    {search
                      ? "Try a different event name or venue."
                      : "Add your first event and keep its seat details handy."}
                  </p>
                  {!search && (
                    <button
                      onClick={openAdd}
                      className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
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
                      className="overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                    >
                      <button
                        onClick={() => {
                          setSelected(ticket);
                          setPage("details");
                          setError("");
                        }}
                        className="block w-full text-left"
                      >
                        {ticket.image_path ? (
                          <Image
                            src={imageUrl(ticket)}
                            alt={ticket.event_name}
                            width={960}
                            height={384}
                            unoptimized
                            className="h-48 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-48 items-center justify-center bg-gradient-to-br from-blue-700 to-indigo-950 text-white">
                            <TicketIcon size={56} />
                          </div>
                        )}
                      </button>

                      <div className="p-5">
                        <h3 className="text-lg font-extrabold">
                          {ticket.event_name}
                        </h3>
                        <p className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                          <CalendarDays
                            size={17}
                            className="mt-0.5 shrink-0 text-blue-600"
                          />
                          {dateLabel(ticket.event_date)}
                        </p>
                        <p className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                          <MapPin
                            size={17}
                            className="mt-0.5 shrink-0 text-blue-600"
                          />
                          {ticket.venue}
                        </p>

                        <div className="mt-5 flex gap-2 border-t pt-4">
                          <button
                            onClick={() => {
                              setSelected(ticket);
                              setPage("details");
                            }}
                            className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                          >
                            View Details
                          </button>
                          <button
                            aria-label={`Edit ${ticket.event_name}`}
                            onClick={() => openEdit(ticket)}
                            className="rounded-xl border p-2.5 hover:bg-slate-50"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            aria-label={`Delete ${ticket.event_name}`}
                            onClick={() => deleteTicket(ticket)}
                            className="rounded-xl border p-2.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {page === "form" && (
          <section className="mx-auto max-w-2xl">
            <button
              onClick={() => setPage("list")}
              className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-600"
            >
              <ArrowLeft size={18} /> Back to My Tickets
            </button>

            <div className="rounded-3xl border bg-white p-6 shadow-sm sm:p-9">
              <h1 className="text-2xl font-black">
                {editing ? "Edit Ticket" : "Add Ticket"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
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
                    className="flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center hover:border-blue-400"
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt="Event preview"
                        className="max-h-64 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <>
                        <Upload className="mb-3 text-blue-600" size={30} />
                        <span className="font-bold">Upload event image</span>
                        <span className="mt-1 text-xs text-slate-500">
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
                    placeholder="e.g. Summer Sounds Festival"
                    className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
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
                    className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
                  />
                </div>

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
                    placeholder="e.g. Main Arena"
                    className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
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
                      placeholder="102"
                      className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
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
                      placeholder="G"
                      className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
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
                      placeholder="14"
                      className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setPage("list")}
                    className="flex-1 rounded-xl border px-4 py-3 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60"
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

        {page === "details" && selected && (
          <section className="mx-auto max-w-3xl">
            <button
              onClick={() => setPage("list")}
              className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-600"
            >
              <ArrowLeft size={18} /> Back to My Tickets
            </button>

            <article className="overflow-hidden rounded-3xl border bg-white shadow-sm">
              {selected.image_path ? (
                <img
                  src={imageUrl(selected)}
                  alt={selected.event_name}
                  className="max-h-105 w-full object-cover"
                />
              ) : (
                <div className="flex h-64 items-center justify-center bg-gradient-to-br from-blue-700 to-indigo-950 text-white">
                  <TicketIcon size={76} />
                </div>
              )}

              <div className="p-6 sm:p-9">
                <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
                  Ticket details
                </p>
                <h1 className="mt-2 text-3xl font-black">
                  {selected.event_name}
                </h1>

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <CalendarDays className="mb-3 text-blue-600" />
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Date and time
                    </p>
                    <p className="mt-2 font-bold">
                      {dateLabel(selected.event_date)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <MapPin className="mb-3 text-blue-600" />
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Venue
                    </p>
                    <p className="mt-2 font-bold">{selected.venue}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border p-5">
                  <h2 className="font-extrabold">Your seat</h2>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    {[
                      ["Section", selected.section],
                      ["Row", selected.seat_row],
                      ["Seat", selected.seat_number],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="mt-2 text-xl font-black">
                          {value || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    onClick={() => openEdit(selected)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700"
                  >
                    <Pencil size={18} /> Edit Ticket
                  </button>
                  <button
                    onClick={() => deleteTicket(selected)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3 font-bold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={18} /> Delete
                  </button>
                </div>
              </div>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
