import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  Home, User, Wrench, Zap, Droplets, Sparkles, Paintbrush, Hammer,
  Wind, Laptop, ArrowRight, ArrowLeft, MapPin, CheckCircle2, Clock,
  Radar, LayoutDashboard, Power, Star, ShieldCheck, MessageCircle,
  HelpCircle, ChevronRight, ChevronDown, Bell, X, Navigation, Upload,
  AlertTriangle, Phone, Camera, Calendar, CreditCard, Globe, Plus,
  Award, TrendingUp, Briefcase, Mail, MapPinned, LifeBuoy, FileText,
  Image as ImageIcon, Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";

/* ============================================================
   REMINDERS — 1-day-ahead push for scheduled jobs
   ============================================================ */
const MAX_TIMEOUT = 2_147_483_000; // ~24.8 days, safe for setTimeout
function scheduleJobReminder(opts: { category: string; scheduledAt: string }) {
  const when = new Date(opts.scheduledAt).getTime();
  if (Number.isNaN(when)) return;
  const reminderAt = when - 24 * 60 * 60 * 1000;
  const now = Date.now();
  const delay = reminderAt - now;
  const fire = () => {
    const pretty = new Date(when).toLocaleString("en", {
      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    toast("🔔 Reminder · Your scheduled job is tomorrow", {
      description: `${opts.category} — ${pretty}. Both you and your specialist have been notified.`,
      duration: 6500,
    });
  };
  if (when <= now) return; // job already in the past
  if (delay <= 0) {
    // less than 24h away — fire shortly so it still feels like a real push
    setTimeout(fire, 1200);
    return;
  }
  if (delay > MAX_TIMEOUT) return; // too far out for a single timer
  setTimeout(fire, delay);
}

// Ranija probna aplikacija — sklonjena sa korijena na /app.
// Glavni sajt je sada na /.
export const Route = createFileRoute("/app")({
  component: Index,
});

/* ============================================================
   TYPES
   ============================================================ */
type Screen =
  | "splash"
  | "gateway"
  | "login"
  | "signup-client"
  | "signup-specialist"
  | "client-home"
  | "client-categories"
  | "client-details"
  | "client-triage"
  | "client-checkout"
  | "client-tracking"
  | "client-spec-profile"
  | "client-chat"
  | "client-schedule"
  | "client-activity"
  | "client-profile"
  | "client-profile-personal"
  | "client-profile-addresses"
  | "client-profile-help"
  | "spec-dashboard"
  | "spec-radar"
  | "spec-active"
  | "spec-chat"
  | "spec-complete"
  | "spec-calendar"
  | "spec-alerts"
  | "spec-profile"
  | "spec-profile-personal"
  | "spec-profile-niche"
  | "spec-profile-payout"
  | "spec-profile-help";

type Role = "client" | "specialist" | null;

// Canonical job lifecycle state. This is the single source of truth that drives
// all screen routing — never infer screen from multiple booleans.
type JobPhase =
  | 'idle'       // no active job
  | 'open'       // job visible on radar, not yet accepted
  | 'assigned'   // accepted — showing job card + "I'm on my way"
  | 'en_route'   // live map active, routing to client
  | 'arrived'    // GPS-confirmed at address
  | 'working'    // job in progress → navigating to completion form
  | 'completed'; // evaluation submitted, awaiting client cross-check

interface ClientProfile {
  name: string;
  email: string;
  phone: string;
  city: string;
}
interface SpecialistProfile extends ClientProfile {
  niche: string;
  photo: boolean;
  references: boolean;
  idDoc: boolean;
  subSkills: string[];
}
interface BookingDraft {
  category?: string;
  description?: string;
  photos: number;
  video?: boolean;
  scheduled?: string;
}
interface JobRequest {
  id: string;
  type: "Instant" | "Scheduled";
  category: string;
  distance: string;
  client: string;
  note: string;
  photos: number;
  scheduledAt?: number; // ms epoch — for punctuality telemetry
}
interface LiveJobDB {
  id: string;
  category: string;
  description: string;
  city: string;
  job_type: string;
  status: string;
  created_at: string;
  added_at_ms: number | null;
  client_id: string | null;
}
// Extends JobRequest with a Supabase back-reference and the timestamp when this
// job entered the radar — required by the radius-expansion state machine.
type RadarEntry = JobRequest & { dbId?: string; clientId?: string; addedAtMs: number };

/* ============================================================
   CONSTANTS
   ============================================================ */
const CATEGORIES = [
  { id: "plumbing", label: "Plumbing", icon: Droplets },
  { id: "electrical", label: "Electrical", icon: Zap },
  { id: "handyman", label: "Handyman", icon: Wrench },
  { id: "cleaning", label: "Cleaning", icon: Sparkles },
  { id: "painting", label: "Painting", icon: Paintbrush },
  { id: "carpentry", label: "Carpentry", icon: Hammer },
  { id: "hvac", label: "HVAC", icon: Wind },
  { id: "tech", label: "Tech Help", icon: Laptop },
];

const LANGUAGES = ["English", "Español", "Français", "Deutsch", "Italiano"];

// Category-based price benchmarking matrix (USD). Mock backend reference data.
const JOB_PRICE_MATRIX: Record<string, { min: number; max: number }> = {
  Gardening:   { min: 20,  max: 80 },
  Mowing:      { min: 20,  max: 80 },
  Cleaning:    { min: 40,  max: 120 },
  Plumbing:    { min: 70,  max: 180 },
  Electrical:  { min: 50,  max: 350 },
  Tech:        { min: 40,  max: 200 },
  "Tech Help": { min: 40,  max: 200 },
  Painting:    { min: 80,  max: 1200 },
  Handyman:    { min: 40,  max: 250 },
  Carpentry:   { min: 150, max: 4000 },
  HVAC:        { min: 150, max: 4000 },
  Renovation:  { min: 150, max: 4000 },
};
function getPriceRange(category?: string) {
  if (!category) return { min: 40, max: 250 };
  return JOB_PRICE_MATRIX[category] || { min: 40, max: 250 };
}

// Niche-specific job seed templates. Radar/pop-ups MUST only surface jobs that match
// the active specialist's registered niche — never cross-niche (e.g. no Plumbing for Electricians).
const NICHE_JOB_TEMPLATES: Record<string, { note: string; instant: [string, string]; scheduled: string }> = {
  Plumbing:   { note: "Leaking kitchen sink under cabinet.",       instant: ["Toilet won't stop running.", "Burst pipe under bathroom sink."],          scheduled: "Install new bathroom faucet." },
  Electrical: { note: "Outlet sparking in living room.",           instant: ["Breaker keeps tripping in kitchen.", "Ceiling light fixture replacement."], scheduled: "Install smart thermostat & wiring." },
  Cleaning:   { note: "Deep clean 2-bedroom apartment.",           instant: ["Move-out clean, today if possible.", "Post-renovation dust cleanup."],     scheduled: "Recurring weekly clean — start Sat." },
  Gardening:  { note: "Front yard hedge trim and weed pull.",      instant: ["Storm cleanup — branches down.", "Lawn mow before guests arrive."],        scheduled: "Seasonal garden bed prep." },
  Mowing:     { note: "Backyard lawn mow, approx 200 m².",         instant: ["Quick front lawn mow today.", "Edge & mow, side yard included."],         scheduled: "Bi-weekly mow contract." },
  Tech:       { note: "Wi-Fi mesh setup across 3 floors.",         instant: ["Printer won't connect to laptop.", "New TV wall-mount + soundbar pairing."], scheduled: "Home office network rebuild." },
  "Tech Help":{ note: "Wi-Fi mesh setup across 3 floors.",         instant: ["Printer won't connect to laptop.", "New TV wall-mount + soundbar pairing."], scheduled: "Home office network rebuild." },
  Painting:   { note: "Repaint living room — 1 accent wall.",      instant: ["Touch-up paint after furniture move.", "Front door repaint, today."],      scheduled: "Full bedroom repaint, 2 coats." },
  Handyman:   { note: "Mount 2 shelves and assemble a desk.",      instant: ["TV wall-mount install.", "Hang 4 framed pieces, level."],                  scheduled: "Assemble flat-pack wardrobe." },
  Carpentry:  { note: "Custom shelving in walk-in closet.",        instant: ["Fix squeaky stair tread.", "Repair sagging cabinet door."],                scheduled: "Build floating bookshelf wall." },
  HVAC:       { note: "AC not cooling — needs diagnostic.",        instant: ["Furnace making rattling noise.", "Thermostat won't hold setpoint."],      scheduled: "Annual HVAC tune-up & filter swap." },
  Renovation: { note: "Bathroom refresh — tile + vanity scope.",   instant: ["Drywall patch after leak repair.", "Kitchen backsplash quick refresh."],   scheduled: "Master bath remodel walkthrough." },
};
function getJobsForNiche(niche: string | undefined): JobRequest[] {
  const key = niche && NICHE_JOB_TEMPLATES[niche] ? niche : "Handyman";
  const t = NICHE_JOB_TEMPLATES[key];
  return [
    { id: "j1", type: "Instant",   category: key, distance: "0.8 km", client: "Sarah M.", note: t.instant[0], photos: 3 },
    // Scheduled demo job — seeded 22 min in the past so completion screen exercises the late-validation flow.
    { id: "j2", type: "Scheduled", category: key, distance: "1.6 km", client: "James R.", note: t.scheduled,  photos: 2, scheduledAt: Date.now() - 22 * 60 * 1000 },
    { id: "j3", type: "Instant",   category: key, distance: "2.1 km", client: "Emma K.",  note: t.instant[1], photos: 1 },
  ];
}
const SAMPLE_JOBS: JobRequest[] = getJobsForNiche("Plumbing");

/* ============================================================
   SUPABASE SYNC HELPERS
   All functions are optimistic: local state updates immediately.
   DB writes fire in the background — errors surface as toasts only,
   never as UI freezes. The try/catch pattern is enforced everywhere.
   ============================================================ */

// Creates a synthetic job + booking record in Supabase when a specialist
// accepts an instant job. Returns the booking ID for phase-sync tracking.
async function dbCreateBooking(specId: string, category: string): Promise<string | null> {
  try {
    const { data: jobRow, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        client_id: specId,          // demo: spec plays both roles in single-player flow
        category,
        description: "Instant job via REDDY platform",
        city: "",
        job_type: "instant",
        status: "assigned",
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    const { data: bookingRow, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        job_id: jobRow.id,
        specialist_id: specId,
        client_id: specId,
        status: "accepted",
        client_service_fee: 5.00,
        platform_commission: 15.00,
      })
      .select("id")
      .single();
    if (bookingErr) throw bookingErr;

    return bookingRow.id as string;
  } catch (err) {
    console.warn("[REDDY] dbCreateBooking failed:", err);
    return null;
  }
}

// Maps the canonical JobPhase to the DB status string and updates the booking row.
async function dbSyncPhase(bookingId: string | null, phase: JobPhase): Promise<void> {
  if (!bookingId) return;
  const phaseToStatus: Partial<Record<JobPhase, string>> = {
    assigned: "accepted",
    en_route: "en_route",
    arrived:  "arrived",
    working:  "working",
    completed: "completed",
    idle:     "cancelled",
  };
  const status = phaseToStatus[phase];
  if (!status) return;
  try {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId);
    if (error) throw error;
  } catch (err) {
    console.warn("[REDDY] dbSyncPhase failed:", err);
  }
}

// Writes both price values and the discrepancy flag to the booking record.
// Called twice: once with handyman price only, once with both after client confirms.
async function dbSavePrices(
  bookingId: string | null,
  handymanPrice: number,
  clientPrice: number | null,
  discrepancy: boolean,
): Promise<void> {
  if (!bookingId) return;
  try {
    const patch: Record<string, unknown> = {
      handyman_reported_price: handymanPrice,
      price_discrepancy: discrepancy,
    };
    if (clientPrice !== null) {
      patch.client_reported_price = clientPrice;
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("bookings").update(patch).eq("id", bookingId);
    if (error) throw error;
  } catch (err) {
    console.warn("[REDDY] dbSavePrices failed:", err);
  }
}

// Increments client_completed_jobs_count in the profiles table after a
// verified job completion. Uses the current local count to avoid a stale read.
async function dbIncrementClientJobCount(clientId: string, currentCount: number): Promise<void> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ client_completed_jobs_count: currentCount + 1 })
      .eq("id", clientId);
    if (error) throw error;
  } catch (err) {
    console.warn("[REDDY] dbIncrementClientJobCount failed:", err);
  }
}

// Bulletproof timestamp → milliseconds conversion.
// Handles ISO strings, Unix-ms numbers, null, undefined, and malformed values.
// Falls back to Date.now() so a bad DB value never produces NaN in time math.
function safeMs(ts: string | number | null | undefined): number {
  if (ts == null) return Date.now();
  if (typeof ts === "number") return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
  const t = Date.parse(ts);
  return Number.isFinite(t) && t > 0 ? t : Date.now();
}

// Creates a job with status "open" (no specialist yet) when a client posts a
// booking through the payment flow. Fires a bookings row immediately so the
// active booking ID can be tracked through the search / matching phases.
async function dbPostClientJob(opts: {
  clientId:    string | null;
  category:    string;
  description: string;
  city:        string;
  jobType:     "instant" | "scheduled";
  serviceFee:  number;
  photos:      number;
  video?:      boolean;
}): Promise<string | null> {
  if (!opts.clientId) return null;
  try {
    const { data: jobRow, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        client_id:   opts.clientId,
        category:    opts.category,
        description: opts.description,
        city:        opts.city,
        job_type:    opts.jobType,
        status:      "open",
        added_at_ms: Date.now(),   // client-side Unix ms — immune to server clock drift
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    await supabase.from("bookings").insert({
      job_id:             jobRow.id,
      client_id:          opts.clientId,
      status:             "open",
      client_service_fee: opts.serviceFee,
    });
    return jobRow.id as string;
  } catch (err) {
    console.warn("[REDDY] dbPostClientJob failed:", err);
    return null;
  }
}

// Atomically claim an open job for this specialist. Returns the new booking ID,
// or null if another specialist won the race (status was already changed).
async function dbAcceptJob(opts: {
  jobDbId:  string;
  specId:   string;
  clientId: string;
  category: string;
}): Promise<string | null> {
  try {
    // .maybeSingle() returns null (not an error) when 0 rows matched, so RLS-blocked
    // or already-accepted jobs produce data=null instead of a hard PGRST116 exception.
    const { data: updated, error: updateErr } = await supabase
      .from("jobs")
      .update({ status: "accepted" })
      .eq("id", opts.jobDbId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (updateErr) {
      // A real DB / network / RLS error — not a zero-row result.
      console.error("CRITICAL DATABASE MATCH FAIL:", updateErr);
      toast.error("Accept failed", { id: "accept-error", description: `DB error: ${updateErr.message ?? updateErr.code ?? "unknown"}` });
      return null;
    }
    if (!updated) {
      // 0 rows updated: job was already accepted by another specialist, or RLS blocked it.
      console.warn("[REDDY] dbAcceptJob: 0 rows updated — job may be taken or RLS blocked the UPDATE");
      toast.error("Job no longer available", { id: "job-taken", description: "Another specialist accepted it first." });
      return null;
    }
    const { data: bookingRow, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        job_id:              opts.jobDbId,
        specialist_id:       opts.specId,
        client_id:           opts.clientId,
        status:              "accepted",
        client_service_fee:  5.00,
        platform_commission: 15.00,
      })
      .select("id")
      .single();
    if (bookingErr) throw bookingErr;
    return bookingRow.id as string;
  } catch (err) {
    console.warn("[REDDY] dbAcceptJob failed:", err);
    return null;
  }
}

/* ============================================================
   COUNTRY CODES
   Used by PhoneField in both signup forms. Add more entries as needed.
   ============================================================ */
const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "+1",   label: "+1   US / Canada" },
  { code: "+44",  label: "+44  UK" },
  { code: "+49",  label: "+49  Germany" },
  { code: "+33",  label: "+33  France" },
  { code: "+39",  label: "+39  Italy" },
  { code: "+34",  label: "+34  Spain" },
  { code: "+31",  label: "+31  Netherlands" },
  { code: "+32",  label: "+32  Belgium" },
  { code: "+41",  label: "+41  Switzerland" },
  { code: "+43",  label: "+43  Austria" },
  { code: "+48",  label: "+48  Poland" },
  { code: "+46",  label: "+46  Sweden" },
  { code: "+47",  label: "+47  Norway" },
  { code: "+45",  label: "+45  Denmark" },
  { code: "+358", label: "+358 Finland" },
  { code: "+351", label: "+351 Portugal" },
  { code: "+30",  label: "+30  Greece" },
  { code: "+420", label: "+420 Czech Rep." },
  { code: "+421", label: "+421 Slovakia" },
  { code: "+36",  label: "+36  Hungary" },
  { code: "+40",  label: "+40  Romania" },
  { code: "+359", label: "+359 Bulgaria" },
  { code: "+385", label: "+385 Croatia" },
  { code: "+386", label: "+386 Slovenia" },
  { code: "+387", label: "+387 Bosnia & Herz." },
  { code: "+381", label: "+381 Serbia" },
  { code: "+382", label: "+382 Montenegro" },
  { code: "+383", label: "+383 Kosovo" },
  { code: "+389", label: "+389 N. Macedonia" },
  { code: "+355", label: "+355 Albania" },
  { code: "+7",   label: "+7   Russia / KZ" },
  { code: "+380", label: "+380 Ukraine" },
  { code: "+90",  label: "+90  Turkey" },
  { code: "+972", label: "+972 Israel" },
  { code: "+971", label: "+971 UAE" },
  { code: "+966", label: "+966 Saudi Arabia" },
  { code: "+91",  label: "+91  India" },
  { code: "+86",  label: "+86  China" },
  { code: "+81",  label: "+81  Japan" },
  { code: "+82",  label: "+82  South Korea" },
  { code: "+61",  label: "+61  Australia" },
  { code: "+64",  label: "+64  New Zealand" },
  { code: "+55",  label: "+55  Brazil" },
  { code: "+52",  label: "+52  Mexico" },
  { code: "+54",  label: "+54  Argentina" },
  { code: "+57",  label: "+57  Colombia" },
  { code: "+56",  label: "+56  Chile" },
  { code: "+27",  label: "+27  South Africa" },
  { code: "+234", label: "+234 Nigeria" },
  { code: "+20",  label: "+20  Egypt" },
  { code: "+254", label: "+254 Kenya" },
];

// Combines the user-selected dial code with the locally typed digits.
// Strips all non-digit characters from the local part before concatenating.
function buildPhone(dialCode: string, localNumber: string): string {
  return dialCode + localNumber.replace(/\D/g, "");
}

/* ============================================================
   ROOT
   ============================================================ */
function Index() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [role, setRole] = useState<Role>(null);
  const [lang, setLang] = useState("English");
  const [client, setClient] = useState<ClientProfile>({
    name: "", email: "", phone: "", city: "",
  });
  const [specialist, setSpecialist] = useState<SpecialistProfile>({
    name: "", email: "", phone: "", city: "", niche: "Plumbing", photo: false, references: false,
    idDoc: false, subSkills: ["Emergency Repair", "Installation", "Diagnostics"],
  });
  const [booking, setBooking] = useState<BookingDraft>({ photos: 0 });
  const [activeJob, setActiveJob] = useState<JobRequest | null>(null);
  const [completedJobs, setCompletedJobs] = useState<number>(0);
  const [instantDone, setInstantDone] = useState<number>(0);
  const [scheduledDone, setScheduledDone] = useState<number>(0);
  const [acceptedScheduled, setAcceptedScheduled] = useState<JobRequest[]>([]);
  const [trustScore, setTrustScore] = useState<number>(75);
  const [totalEarned, setTotalEarned] = useState<number>(0);
  const [alertsCount, setAlertsCount] = useState<number>(SAMPLE_JOBS.length);
  const [verificationStatus, setVerificationStatus] = useState<string>("unverified");
  const [masterStatus, setMasterStatus] = useState<string>("inactive");
  const [specUserId, setSpecUserId] = useState<string | null>(null);
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [clientJobStartedAt, setClientJobStartedAt] = useState<number | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [handymanReportedPrice, setHandymanReportedPrice] = useState<number | null>(null);
  const [clientJobCount, setClientJobCount] = useState<number>(0);
  const [clientPricePrompt, setClientPricePrompt] = useState<boolean>(false);
  const [specOnline, setSpecOnline] = useState<boolean>(true);
  const [enRoute, setEnRoute] = useState<boolean>(false);
  const [ratingPrompt, setRatingPrompt] = useState<boolean>(false);
  const [lastEval, setLastEval] = useState<null | { tone: "good" | "warn" | "bad"; overpriced: boolean; category: string; amount: number }>(null);
  const [chatLock, setChatLock] = useState<null | { specId: string; name: string }>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('idle');

  // splash auto-advance — ultra-fast diagonal reveal
  useEffect(() => {
    if (screen === "splash") {
      const t = setTimeout(() => setScreen("gateway"), 450);
      return () => clearTimeout(t);
    }
  }, [screen]);

  // ── JOB PHASE ROUTING ENGINE ──────────────────────────────────────────────
  // Single source of truth: jobPhase drives ALL specialist screen transitions.
  // Runs on every phase OR screen change so navigating away during an active job
  // forces the specialist back to the correct screen automatically.
  useEffect(() => {
    switch (jobPhase) {
      case 'assigned':
        // Accepted but not yet en route — must stay on active job screen
        if (screen !== 'spec-active') setScreen('spec-active');
        break;
      case 'en_route':
      case 'arrived':
        // Live map / on-site — allow chat as side-screen, block everything else
        if (screen !== 'spec-active' && screen !== 'spec-chat') setScreen('spec-active');
        break;
      case 'working':
        // Transitioning to completion form — allow active + chat + complete
        if (screen !== 'spec-active' && screen !== 'spec-chat' && screen !== 'spec-complete') {
          setScreen('spec-active');
        }
        break;
      case 'completed':
        // Evaluation submitted — stay on completion screen until finish()
        if (screen !== 'spec-complete') setScreen('spec-complete');
        break;
      case 'idle':
      case 'open':
      default:
        break;
    }
  }, [jobPhase, screen]);

  // ── CLIENT PROFILE SYNC (loyalty engine) ────────────────────────────────
  // Fetches client_completed_jobs_count so the loyalty waiver check in
  // ClientCheckout always reflects the real DB value, not a stale local count.
  useEffect(() => {
    if (!clientUserId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("client_completed_jobs_count")
          .eq("id", clientUserId)
          .single();
        if (error) throw error;
        setClientJobCount(data.client_completed_jobs_count ?? 0);
      } catch {
        // Non-fatal — local count from state is still accurate for this session
      }
    })();
  }, [clientUserId]);

  return (
    <div className="min-h-screen w-full app-gradient flex items-center justify-center p-0 sm:p-6">
      <div className="relative w-full max-w-[430px] min-h-screen sm:min-h-[860px] sm:h-[860px] bg-white sm:rounded-[40px] shadow-soft overflow-hidden flex flex-col border-0 sm:border border-[var(--beige-border)]">
        <ScreenRouter
          screen={screen}
          setScreen={setScreen}
          role={role}
          setRole={setRole}
          lang={lang}
          setLang={setLang}
          client={client}
          setClient={setClient}
          specialist={specialist}
          setSpecialist={setSpecialist}
          booking={booking}
          setBooking={setBooking}
          activeJob={activeJob}
          setActiveJob={setActiveJob}
          completedJobs={completedJobs}
          setCompletedJobs={setCompletedJobs}
          instantDone={instantDone}
          setInstantDone={setInstantDone}
          scheduledDone={scheduledDone}
          setScheduledDone={setScheduledDone}
          acceptedScheduled={acceptedScheduled}
          setAcceptedScheduled={setAcceptedScheduled}
          trustScore={trustScore}
          setTrustScore={setTrustScore}
          totalEarned={totalEarned}
          setTotalEarned={setTotalEarned}
          specOnline={specOnline}
          setSpecOnline={setSpecOnline}
          enRoute={enRoute}
          setEnRoute={setEnRoute}
          ratingPrompt={ratingPrompt}
          setRatingPrompt={setRatingPrompt}
          lastEval={lastEval}
          setLastEval={setLastEval}
          chatLock={chatLock}
          setChatLock={setChatLock}
          alertsCount={alertsCount}
          setAlertsCount={setAlertsCount}
          verificationStatus={verificationStatus}
          setVerificationStatus={setVerificationStatus}
          masterStatus={masterStatus}
          setMasterStatus={setMasterStatus}
          specUserId={specUserId}
          setSpecUserId={setSpecUserId}
          handymanReportedPrice={handymanReportedPrice}
          setHandymanReportedPrice={setHandymanReportedPrice}
          clientJobCount={clientJobCount}
          setClientJobCount={setClientJobCount}
          clientPricePrompt={clientPricePrompt}
          setClientPricePrompt={setClientPricePrompt}
          jobPhase={jobPhase}
          setJobPhase={setJobPhase}
          activeBookingId={activeBookingId}
          setActiveBookingId={setActiveBookingId}
          clientUserId={clientUserId}
          setClientUserId={setClientUserId}
          clientJobStartedAt={clientJobStartedAt}
          setClientJobStartedAt={setClientJobStartedAt}
        />
      </div>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

/* ============================================================
   ROUTER
   ============================================================ */
interface RouterProps {
  screen: Screen; setScreen: (s: Screen) => void;
  role: Role; setRole: (r: Role) => void;
  lang: string; setLang: (l: string) => void;
  client: ClientProfile; setClient: (c: ClientProfile) => void;
  specialist: SpecialistProfile; setSpecialist: (s: SpecialistProfile) => void;
  booking: BookingDraft; setBooking: (b: BookingDraft) => void;
  activeJob: JobRequest | null; setActiveJob: (j: JobRequest | null) => void;
  completedJobs: number; setCompletedJobs: (n: number) => void;
  instantDone: number; setInstantDone: (n: number) => void;
  scheduledDone: number; setScheduledDone: (n: number) => void;
  acceptedScheduled: JobRequest[]; setAcceptedScheduled: (j: JobRequest[]) => void;
  trustScore: number; setTrustScore: (n: number) => void;
  totalEarned: number; setTotalEarned: (n: number) => void;
  specOnline: boolean; setSpecOnline: (b: boolean) => void;
  enRoute: boolean; setEnRoute: (b: boolean) => void;
  ratingPrompt: boolean; setRatingPrompt: (b: boolean) => void;
  lastEval: null | { tone: "good" | "warn" | "bad"; overpriced: boolean; category: string; amount: number };
  setLastEval: (e: null | { tone: "good" | "warn" | "bad"; overpriced: boolean; category: string; amount: number }) => void;
  chatLock: null | { specId: string; name: string }; setChatLock: (c: null | { specId: string; name: string }) => void;
  alertsCount: number; setAlertsCount: (n: number) => void;
  verificationStatus: string; setVerificationStatus: (s: string) => void;
  masterStatus: string; setMasterStatus: (s: string) => void;
  specUserId: string | null; setSpecUserId: (id: string | null) => void;
  handymanReportedPrice: number | null; setHandymanReportedPrice: (n: number | null) => void;
  clientJobCount: number; setClientJobCount: (n: number) => void;
  clientPricePrompt: boolean; setClientPricePrompt: (b: boolean) => void;
  jobPhase: JobPhase; setJobPhase: (phase: JobPhase) => void;
  activeBookingId: string | null; setActiveBookingId: (id: string | null) => void;
  clientUserId: string | null; setClientUserId: (id: string | null) => void;
  clientJobStartedAt: number | null; setClientJobStartedAt: (t: number | null) => void;
}

function ScreenRouter(p: RouterProps) {
  return (
    <>
      {p.screen === "splash" && <Splash />}
      {p.screen !== "splash" && (
        <>
          {p.role === null         && <PreAuthScreens {...p} />}
          {p.role === "client"     && <ClientView {...p} />}
          {p.role === "specialist" && <SpecialistView {...p} />}
          <SplashOverlay />
        </>
      )}
    </>
  );
}

/* Pre-auth — gateway + signups, no role assigned yet */
function PreAuthScreens(p: RouterProps) {
  switch (p.screen) {
    case "gateway":           return <Gateway {...p} />;
    case "login":             return <LoginScreen {...p} />;
    case "signup-client":     return <SignupClient {...p} />;
    case "signup-specialist": return <SignupSpecialist {...p} />;
    default:                  return null;
  }
}

/* ── CLIENT VIEW ─────────────────────────────────────────────────────────────
   All client screens are rendered here and nowhere else.
   Client-scoped overlays (price confirm, ratings) are co-located here so they
   are structurally impossible to render inside SpecialistView. */
function ClientScreenContent(p: RouterProps) {
  switch (p.screen) {
    case "client-home":              return <ClientHome {...p} />;
    case "client-categories":        return <ClientCategories {...p} />;
    case "client-details":           return <ClientDetails {...p} />;
    case "client-triage":            return <ClientTriage {...p} />;
    case "client-checkout":          return <ClientCheckout {...p} />;
    case "client-tracking":          return <ClientTracking {...p} />;
    case "client-spec-profile":      return <SpecialistDetailScreen {...p} />;
    case "client-chat":              return <ChatScreen {...p} who="client" />;
    case "client-schedule":          return <ClientSchedule {...p} />;
    case "client-activity":          return <ClientActivity {...p} />;
    case "client-profile":           return <ClientProfileScreen {...p} />;
    case "client-profile-personal":  return <ProfilePersonal back="client-profile" {...p} />;
    case "client-profile-addresses": return <ProfileAddresses {...p} />;
    case "client-profile-help":      return <ProfileHelp back="client-profile" {...p} />;
    default:                         return null;
  }
}

function ClientView(p: RouterProps) {
  // Realtime listener lives here — ClientView is always mounted while the client is
  // logged in, so the subscription survives screen changes. ClientTracking unmounts
  // when the user navigates away, which would tear down a subscription placed there.
  // Strategy:
  //   PRIMARY  → bookings INSERT: carries client_id + booking id directly, no REPLICA
  //              IDENTITY FULL needed. Sets activeBookingId and navigates to tracking.
  //   FALLBACK → jobs UPDATE: fires once REPLICA IDENTITY FULL is set in Supabase.
  //              Navigates to tracking; ClientTracking derives bookingId from activeBookingId.
  useEffect(() => {
    // Guard: must have a real UUID, not null / the literal strings "null" or "undefined".
    // Guard: only subscribe when there is an active job being searched (clientJobStartedAt
    // is set by handlePay right after the job is written to the DB).
    if (
      !p.clientUserId ||
      p.clientUserId === "null" ||
      p.clientUserId === "undefined" ||
      !p.clientJobStartedAt
    ) return;

    const ch = supabase
      .channel(`client-match-${p.clientUserId}`)
      // PRIMARY — bookings INSERT with a row-level filter.
      // The filter `client_id=eq.{uuid}` is critical: without it, Supabase validates
      // the subscription against the full table via a REST SELECT, which RLS blocks → 400.
      // With the filter, Supabase validates only the client's own rows, which RLS allows.
      // INSERT events carry all new-row columns even without REPLICA IDENTITY FULL.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `client_id=eq.${p.clientUserId}`,   // ← narrows RLS validation to this client
        },
        (payload) => {
          const row = payload.new as { id: string; client_id: string; status: string };
          console.log("[REDDY] bookings INSERT →", row);
          if (!row.id || row.status !== "accepted") return;        // defensive: skip non-accept events
          p.setActiveBookingId(row.id);                            // top-level — survives screen changes
          p.setScreen("client-tracking");                          // explicit screen switch
        },
      )
      // FALLBACK — jobs UPDATE (requires REPLICA IDENTITY FULL on jobs table).
      // No filter here because client_id on UPDATE events needs REPLICA IDENTITY FULL
      // to be available; we match client-side instead.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        (payload) => {
          const row = payload.new as { status: string; client_id: string };
          console.log("[REDDY] jobs UPDATE →", row);
          if (row.status === "accepted" && row.client_id === p.clientUserId) {
            p.setScreen("client-tracking");
          }
        },
      )
      .subscribe((status) => { console.log("[REDDY] client-match channel status:", status); });

    return () => { supabase.removeChannel(ch); };
  }, [p.clientUserId, p.clientJobStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ClientScreenContent {...p} />
      {/* Client-scoped overlays — structurally impossible to appear in SpecialistView */}
      {p.clientPricePrompt && p.handymanReportedPrice !== null && (
        <ClientPriceConfirmModal p={p} close={() => p.setClientPricePrompt(false)} />
      )}
    </>
  );
}

/* ── SPECIALIST VIEW ─────────────────────────────────────────────────────────
   All specialist screens are rendered here and nowhere else.
   Owns the Supabase profile sync for trust_score, tier, master_status, and
   verification_status. Loading is handled locally so the rest of the app never
   freezes. No client-scoped modals or overlays exist in this view — by design. */
function SpecialistView(p: RouterProps) {
  // Initialise to true when specUserId is already known (post-signup) so we
  // show the loading state on first render rather than a flash of stale data.
  const [profileLoading, setProfileLoading] = useState(!!p.specUserId);

  useEffect(() => {
    if (!p.specUserId) return;
    setProfileLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("trust_score, verification_status, master_status")
          .eq("id", p.specUserId)
          .single();
        if (error) throw error;
        p.setTrustScore(data.trust_score ?? 75);
        p.setVerificationStatus(data.verification_status ?? "unverified");
        p.setMasterStatus(data.master_status ?? "inactive");
      } catch {
        toast.error("Profile sync failed", { description: "Using local cached values." });
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [p.specUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tier is derived from the freshly-synced trust_score — not a separate DB column.
  const tier =
    p.trustScore >= 90 ? "Platinum" :
    p.trustScore >= 80 ? "Gold" :
    p.trustScore >= 70 ? "Silver" : "Bronze";

  if (profileLoading) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-[16px] sunshine-gradient animate-pulse" />
        <div className="text-[14px] font-bold text-[var(--plum-deep)]/60 tracking-tight">
          Syncing your profile…
        </div>
        <div className="text-[12px] font-semibold text-[var(--plum-deep)]/40">
          {tier} · Trust Score {p.trustScore}
        </div>
      </div>
    );
  }

  switch (p.screen) {
    case "spec-dashboard":        return <SpecDashboard {...p} />;
    case "spec-radar":            return <SpecRadar {...p} />;
    case "spec-active":           return <SpecActive {...p} />;
    case "spec-chat":             return <ChatScreen {...p} who="specialist" />;
    case "spec-complete":         return <SpecComplete {...p} />;
    case "spec-calendar":         return <SpecCalendar {...p} />;
    case "spec-alerts":           return <SpecAlertsScreen {...p} />;
    case "spec-profile":          return <SpecProfileScreen {...p} />;
    case "spec-profile-personal": return <ProfilePersonal back="spec-profile" {...p} />;
    case "spec-profile-niche":    return <SpecNicheScreen {...p} />;
    case "spec-profile-payout":   return <SpecPayoutScreen {...p} />;
    case "spec-profile-help":     return <ProfileHelp back="spec-profile" {...p} />;
    default:                      return null;
  }
}

/* ============================================================
   PRIMITIVES
   ============================================================ */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-[12px] sunshine-gradient flex items-center justify-center shadow-glow flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-black text-[var(--plum-deep)] leading-none" style={{ fontSize: size * 0.55, letterSpacing: "-0.05em" }}>R</span>
    </div>
  );
}

function TopBar({ title, onBack, right, brand }: { title: string; onBack?: () => void; right?: React.ReactNode; brand?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-3 bg-white">
      {onBack && (
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[var(--beige)] flex items-center justify-center active:scale-95 transition">
          <ArrowLeft className="w-5 h-5 text-[var(--plum-deep)]" />
        </button>
      )}
      {brand && !onBack && <BrandMark size={36} />}
      <h1 className="text-[19px] font-extrabold text-[var(--plum-deep)] tracking-tight flex-1">{title}</h1>
      {right}
    </div>
  );
}

function PrimaryBtn({ children, onClick, variant = "plum", disabled, className = "" }: {
  children: React.ReactNode; onClick?: () => void; variant?: "plum" | "sunshine" | "outline" | "danger"; disabled?: boolean; className?: string;
}) {
  const styles = {
    plum: "plum-gradient text-white shadow-soft",
    sunshine: "sunshine-gradient text-[var(--plum-deep)] shadow-glow",
    outline: "bg-white text-[var(--plum-deep)] border-2 border-[var(--beige-border)]",
    danger: "bg-[var(--destructive)] text-white",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-14 rounded-2xl font-extrabold text-[15px] tracking-tight active:scale-[0.98] transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)] focus:bg-white transition"
      />
    </label>
  );
}

function PhoneField({ dialCode, setDialCode, localNumber, setLocalNumber }: {
  dialCode: string; setDialCode: (v: string) => void;
  localNumber: string; setLocalNumber: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Phone</span>
      <div className="flex gap-2">
        <div className="relative flex-shrink-0">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className="h-12 pl-3 pr-7 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold appearance-none focus:outline-none focus:border-[var(--sunshine-deep)] focus:bg-white transition text-[13px]"
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--plum-deep)]/50 pointer-events-none" />
        </div>
        <input
          type="tel"
          value={localNumber}
          onChange={(e) => setLocalNumber(e.target.value)}
          placeholder="555 0123"
          className="flex-1 h-12 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)] focus:bg-white transition"
        />
      </div>
    </label>
  );
}

function ClientBottomNav({ active, setScreen }: { active: "home" | "activity" | "profile"; setScreen: (s: Screen) => void }) {
  const items: { key: typeof active; label: string; icon: any; screen: Screen }[] = [
    { key: "home", label: "Home", icon: Home, screen: "client-home" },
    { key: "activity", label: "Activity", icon: Clock, screen: "client-activity" },
    { key: "profile", label: "Profile", icon: User, screen: "client-profile" },
  ];
  return <BottomNav items={items} active={active} setScreen={setScreen} />;
}

function SpecBottomNav({ active, setScreen }: { active: "dashboard" | "radar" | "calendar" | "profile"; setScreen: (s: Screen) => void }) {
  const items: { key: typeof active; label: string; icon: any; screen: Screen }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, screen: "spec-dashboard" },
    { key: "radar", label: "Radar", icon: Radar, screen: "spec-radar" },
    { key: "calendar", label: "Calendar", icon: Calendar, screen: "spec-calendar" },
    { key: "profile", label: "Profile", icon: User, screen: "spec-profile" },
  ];
  return <BottomNav items={items} active={active} setScreen={setScreen} />;
}

function BottomNav({ items, active, setScreen }: { items: any[]; active: string; setScreen: (s: Screen) => void }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[var(--beige-border)] px-6 pt-2 pb-5 flex items-center justify-around">
      {items.map((it) => {
        const Icon = it.icon;
        const on = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setScreen(it.screen)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition ${on ? "text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/40"}`}
          >
            <Icon className={`w-5 h-5 ${on ? "stroke-[2.5]" : ""}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${on ? "" : ""}`}>{it.label}</span>
            {on && <div className="w-1 h-1 rounded-full bg-[var(--sunshine-deep)]" />}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   SPLASH
   ============================================================ */
function Splash() {
  return (
    <div className="absolute inset-0 plum-gradient flex items-center justify-center">
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <div className="absolute inset-0 rounded-[36px] sunshine-gradient rotate-[8deg] shadow-2xl" />
          <div className="absolute inset-0 rounded-[36px] bg-white/10 rotate-[-3deg]" />
          <span
            className="relative text-[88px] font-black text-[var(--plum-deep)] leading-none"
            style={{ fontFamily: "Nunito, sans-serif", letterSpacing: "-0.06em" }}
          >R</span>
        </div>
        <div className="text-center">
          <div className="text-white font-black text-[28px] tracking-[0.3em]">REDDY</div>
          <div className="text-[var(--sunshine)] text-[12px] font-bold tracking-[0.4em] mt-1">ELITE SERVICE</div>
        </div>
      </div>
    </div>
  );
}

/* Diagonal slice overlay played once on app entry to reveal the next screen */
function SplashOverlay() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 850);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;
  const Logo = (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <div className="absolute inset-0 rounded-[36px] sunshine-gradient rotate-[8deg] shadow-2xl" />
      <div className="absolute inset-0 rounded-[36px] bg-white/10 rotate-[-3deg]" />
      <span className="relative text-[88px] font-black text-[var(--plum-deep)] leading-none" style={{ letterSpacing: "-0.06em" }}>R</span>
    </div>
  );
  return (
    <>
      <div className="splash-top absolute inset-0 plum-gradient z-50 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-6">{Logo}</div>
      </div>
      <div className="splash-bottom absolute inset-0 plum-gradient z-50 flex items-center justify-center pointer-events-none" />
    </>
  );
}

/* ============================================================
   GATEWAY
   ============================================================ */
function Gateway({ setScreen, lang, setLang }: RouterProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[var(--cream)] to-white slide-up">
      <div className="flex justify-end px-5 pt-6 relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[var(--beige-border)] text-[var(--plum-deep)] font-bold text-[13px] shadow-sm"
        >
          <Globe className="w-4 h-4" /> {lang} <ChevronDown className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute top-16 right-5 bg-white rounded-2xl shadow-soft border border-[var(--beige-border)] py-2 z-20 min-w-[160px]">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => { setLang(l); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-[var(--cream)] ${l === lang ? "text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/60"}`}
              >{l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center px-7 -mt-4">
        <div className="w-20 h-20 rounded-[24px] sunshine-gradient flex items-center justify-center mb-8 shadow-glow float-soft">
          <span className="text-[48px] font-black text-[var(--plum-deep)] leading-none">R</span>
        </div>
        <h1 className="text-[34px] font-black text-[var(--plum-deep)] leading-[1.05] tracking-tight">
          Elite service<br />at your fingertips.
        </h1>
        <p className="mt-4 text-[16px] text-[var(--plum-deep)]/65 font-semibold leading-snug">
          The right specialist, right now.
        </p>
      </div>

      <div className="px-7 pb-10 space-y-3">
        <PrimaryBtn variant="sunshine" onClick={() => setScreen("signup-client")}>
          Sign up as Client <ArrowRight className="inline w-4 h-4 ml-1" />
        </PrimaryBtn>
        <PrimaryBtn variant="plum" onClick={() => setScreen("signup-specialist")}>
          Apply as Specialist <ArrowRight className="inline w-4 h-4 ml-1" />
        </PrimaryBtn>
        <button
          onClick={() => setScreen("login")}
          className="w-full py-1.5 text-center text-[14px] font-bold text-[var(--plum-deep)]/55 hover:text-[var(--plum-deep)] transition-colors"
        >
          Already have an account?{" "}
          <span className="text-[var(--plum-deep)] underline underline-offset-2">Log In</span>
        </button>
        <p className="text-center text-[12px] text-[var(--plum-deep)]/50 font-semibold">
          By continuing you agree to our Terms & Privacy.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   LOG IN
   ============================================================ */
function LoginScreen({ setScreen, setRole, setClient, setClientUserId, setSpecialist, setSpecUserId }: RouterProps) {
  const [email, setEmailVal] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const valid = email.includes("@") && password.length >= 6;

  const handleLogin = async () => {
    if (!valid) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Login failed", { description: error.message });
      setLoading(false);
      return;
    }
    if (!data.user) {
      toast.error("Login failed", { description: "No session returned. Please try again." });
      setLoading(false);
      return;
    }
    // Fetch role + display fields from profiles table
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, full_name, email, city, niche")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileErr || !profile) {
      toast.error("Profile not found", { description: "Could not load your account. Try registering instead." });
      setLoading(false);
      return;
    }
    if (profile.role === "client") {
      setClientUserId(data.user.id);
      setClient({ name: profile.full_name ?? "", email: profile.email ?? email, phone: "", city: profile.city ?? "" });
      setRole("client");
      setScreen("client-home");
    } else if (profile.role === "specialist") {
      setSpecUserId(data.user.id);
      // Populate specialist state so the dashboard renders correctly.
      // SpecialistView's own useEffect will re-sync trust_score / verification / master_status.
      setSpecialist({
        name:       profile.full_name ?? "",
        email:      profile.email ?? email,
        phone:      "",
        city:       profile.city ?? "",
        niche:      profile.niche ?? "Plumbing",
        photo:      true,
        references: false,
        idDoc:      true,
        subSkills:  ["Emergency Repair", "Installation", "Diagnostics"],
      });
      setRole("specialist");
      setScreen("spec-dashboard");
    } else {
      toast.error("Unknown role", { description: "Your account role could not be determined." });
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up overflow-x-hidden">
      <TopBar title="Welcome back" onBack={() => setScreen("gateway")} />
      <div className="px-5 pb-3">
        <p className="text-[14px] text-[var(--plum-deep)]/60 font-semibold">Log in to your REDDY account.</p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 space-y-4 scrollbar-width-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Field label="Email" value={email} onChange={setEmailVal} placeholder="your@email.com" type="email" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="Your password" type="password" />
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="sunshine" disabled={!valid || loading} onClick={handleLogin}>
          {loading ? "Logging in…" : "Log In"}
        </PrimaryBtn>
        <p className="text-center text-[13px] font-semibold text-[var(--plum-deep)]/55 mt-3">
          Don't have an account?{" "}
          <button onClick={() => setScreen("gateway")} className="text-[var(--plum-deep)] font-bold underline underline-offset-2">Sign Up</button>
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   SIGNUP — CLIENT
   ============================================================ */
function SignupClient({ setScreen, setRole, client, setClient, setClientUserId }: RouterProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialCode, setDialCode] = useState("+1");
  const [localNumber, setLocalNumber] = useState("");
  const valid = client.name && client.email && localNumber.trim() && client.city && password.length >= 6;

  const handleSignup = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: client.email, password });
    if (error) {
      toast.error("Registration failed", { description: error.message });
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        role: "client",
        full_name: client.name,
        email: client.email,
        phone: buildPhone(dialCode, localNumber),
        city: client.city,
      });
      if (profileError) {
        toast.error("Profile save failed", { description: profileError.message });
        setLoading(false);
        return;
      }
      setClientUserId(data.user.id); // enables loyalty engine DB sync
    }
    setRole("client");
    setScreen("client-home");
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up overflow-x-hidden">
      <TopBar title="Create your account" onBack={() => setScreen("gateway")} />
      <div className="px-5 pb-3">
        <p className="text-[14px] text-[var(--plum-deep)]/60 font-semibold">Book trusted specialists in minutes.</p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-4 scrollbar-width-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Field label="Full name" value={client.name} onChange={(v) => setClient({ ...client, name: v })} placeholder="Jane Cooper" />
        <Field label="Email" value={client.email} onChange={(v) => setClient({ ...client, email: v })} placeholder="jane@email.com" type="email" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="Min. 6 characters" type="password" />
        <PhoneField dialCode={dialCode} setDialCode={setDialCode} localNumber={localNumber} setLocalNumber={setLocalNumber} />
        <Field label="City" value={client.city} onChange={(v) => setClient({ ...client, city: v })} placeholder="San Francisco" />
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="sunshine" disabled={!valid || loading} onClick={handleSignup}>
          {loading ? "Creating account…" : "Create account"}
        </PrimaryBtn>
        <p className="text-center text-[13px] font-semibold text-[var(--plum-deep)]/55 mt-3">
          Already have an account?{" "}
          <button onClick={() => setScreen("login")} className="text-[var(--plum-deep)] font-bold underline underline-offset-2">Log In</button>
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   SIGNUP — SPECIALIST
   ============================================================ */
function SignupSpecialist({ setScreen, setRole, specialist, setSpecialist, setSpecUserId }: RouterProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialCode, setDialCode] = useState("+1");
  const [localNumber, setLocalNumber] = useState("");
  const valid = specialist.name && specialist.email && localNumber.trim() && specialist.city && specialist.photo && specialist.idDoc && password.length >= 6;

  const handleSignup = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: specialist.email, password });
    if (error) {
      toast.error("Registration failed", { description: error.message });
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        role: "specialist",
        full_name: specialist.name,
        email: specialist.email,
        phone: buildPhone(dialCode, localNumber),
        city: specialist.city,
        niche: specialist.niche,
        has_photo: specialist.photo,
        has_id_doc: specialist.idDoc,
        trust_score: 75,
      });
      if (profileError) {
        toast.error("Profile save failed", { description: profileError.message });
        setLoading(false);
        return;
      }
      setSpecUserId(data.user.id); // triggers the profile-sync useEffect in Index
    }
    setRole("specialist");
    setScreen("spec-dashboard");
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up overflow-x-hidden">
      <TopBar title="Apply as Specialist" onBack={() => setScreen("gateway")} />
      <div className="px-5 pb-3">
        <p className="text-[14px] text-[var(--plum-deep)]/60 font-semibold">Join the trusted network. Clients pay you directly — REDDY simply collects a flat <span className="font-black text-[var(--plum-deep)]">$15 commission</span> per completed job. New specialists start at <span className="font-black text-[var(--plum-deep)]">Trust Score 70</span>.</p>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-4 scrollbar-width-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className={`rounded-2xl p-4 border-2 ${specialist.photo ? "border-[var(--success)] bg-[var(--success)]/5" : "border-[var(--destructive)]/40 bg-[var(--destructive)]/5"}`}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSpecialist({ ...specialist, photo: !specialist.photo })}
              className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-[var(--beige-border)] bg-[var(--cream)] flex items-center justify-center active:scale-95 transition"
            >
              {specialist.photo ? (
                <div className="w-full h-full plum-gradient flex items-center justify-center text-white text-[28px] font-black">
                  {(specialist.name || "A")[0].toUpperCase()}
                </div>
              ) : (
                <Camera className="w-7 h-7 text-[var(--plum-deep)]/40" />
              )}
            </button>
            <div className="flex-1">
              <div className="text-[14px] font-extrabold text-[var(--plum-deep)] flex items-center gap-1.5">
                Profile picture
                <span className="text-[var(--destructive)]">*</span>
              </div>
              <button onClick={() => setSpecialist({ ...specialist, photo: !specialist.photo })} className="mt-1 text-[12px] font-bold text-[var(--sunshine-deep)] underline">
                {specialist.photo ? "Replace photo" : "Upload photo"}
              </button>
              <div className="text-[11px] font-semibold text-[var(--plum-deep)]/60 mt-1 leading-snug">
                Required for safety verification. Specialists cannot complete registration without a valid profile picture.
              </div>
            </div>
          </div>
        </div>

        <Field label="Full name" value={specialist.name} onChange={(v) => setSpecialist({ ...specialist, name: v })} placeholder="Alex Morgan" />
        <Field label="Email" value={specialist.email} onChange={(v) => setSpecialist({ ...specialist, email: v })} placeholder="alex@email.com" type="email" />
        <Field label="Password" value={password} onChange={setPassword} placeholder="Min. 6 characters" type="password" />
        <PhoneField dialCode={dialCode} setDialCode={setDialCode} localNumber={localNumber} setLocalNumber={setLocalNumber} />
        <Field label="City" value={specialist.city} onChange={(v) => setSpecialist({ ...specialist, city: v })} placeholder="San Francisco" />

        <label className="block">
          <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Niche / Category</span>
          <div className="relative">
            <select
              value={specialist.niche}
              onChange={(e) => setSpecialist({ ...specialist, niche: e.target.value })}
              className="w-full h-12 px-4 pr-10 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold appearance-none focus:outline-none focus:border-[var(--sunshine-deep)]"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--plum-deep)]/50 pointer-events-none" />
          </div>
        </label>

        <div>
          <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">References (PDF / images)</span>
          <button
            onClick={() => setSpecialist({ ...specialist, references: !specialist.references })}
            className={`w-full h-20 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 font-bold transition ${
              specialist.references ? "border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--cream)] border-[var(--beige-border)] text-[var(--plum-deep)]/60"
            }`}
          >
            {specialist.references ? <><CheckCircle2 className="w-5 h-5" /> 2 files uploaded</> : <><Upload className="w-5 h-5" /> Upload references (PDF, images)</>}
          </button>
        </div>

        <div>
          <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Government-issued ID <span className="text-[var(--destructive)]">*</span></span>
          <button
            onClick={() => setSpecialist({ ...specialist, idDoc: !specialist.idDoc })}
            className={`w-full h-24 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 font-bold transition ${
              specialist.idDoc ? "border-[var(--success)] bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--cream)] border-[var(--beige-border)] text-[var(--plum-deep)]/60"
            }`}
          >
            {specialist.idDoc
              ? <><CheckCircle2 className="w-5 h-5" /> ID photo captured · verified</>
              : <><Camera className="w-5 h-5" /> Take photo of ID Card or Passport</>
            }
          </button>
          <div className="text-[11px] font-semibold text-[var(--plum-deep)]/55 mt-1.5 leading-snug">
            Mandatory: photo of your physical ID Card or Passport. Used only for verification — never shared.
          </div>
        </div>

        {(!specialist.photo || !specialist.idDoc) && (
          <div className="rounded-xl bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--destructive)] mt-0.5 flex-shrink-0" />
            <span className="text-[12px] font-semibold text-[var(--destructive)]">Profile picture and government-issued ID are both required for safety verification.</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="plum" disabled={!valid || loading} onClick={handleSignup}>
          {loading ? "Submitting…" : "Submit application"}
        </PrimaryBtn>
        <p className="text-center text-[13px] font-semibold text-[var(--plum-deep)]/55 mt-3">
          Already have an account?{" "}
          <button onClick={() => setScreen("login")} className="text-[var(--plum-deep)] font-bold underline underline-offset-2">Log In</button>
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — HOME
   ============================================================ */
function ClientHome(p: RouterProps) {
  const name = p.client.name.split(" ")[0] || "there";
  const [rateOpen, setRateOpen] = useState(false);
  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <div className="px-6 pt-7 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandMark size={42} />
          <div>
            <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">Welcome back,</div>
            <div className="text-[19px] font-black text-[var(--plum-deep)] tracking-tight leading-tight">{name} 👋</div>
          </div>
        </div>
        <NotificationsBell />
      </div>

      {p.ratingPrompt && (
        <div className="mx-5 mb-2 rounded-2xl sunshine-gradient p-4 chat-pop shadow-glow flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--plum-deep)] flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-[var(--sunshine)] fill-[var(--sunshine)]" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-black text-[var(--plum-deep)]">Job marked complete</div>
            <div className="text-[12px] font-semibold text-[var(--plum-deep)]/75">Tap to rate your specialist.</div>
          </div>
          <button onClick={() => setRateOpen(true)} className="px-3 h-9 rounded-lg bg-[var(--plum-deep)] text-white font-extrabold text-[12px]">
            Rate now
          </button>
        </div>
      )}
      {rateOpen && <ClientRatingModal p={p} close={() => setRateOpen(false)} />}




      <div className="px-6 mt-2">
        <h2 className="text-[17px] font-extrabold text-[var(--plum-deep)] mb-3">How can we help today?</h2>
      </div>

      <div className="flex-1 px-6 space-y-4">
        <button
          onClick={() => setBookingFlow(p, false)}
          className="w-full rounded-[28px] sunshine-gradient p-6 shadow-glow text-left active:scale-[0.99] transition relative overflow-hidden"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/20" />
          <div className="absolute -right-2 -top-4 w-20 h-20 rounded-full bg-white/15" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--plum-deep)] text-white text-[10px] font-black uppercase tracking-wider">
              <Zap className="w-3 h-3" /> Fastest
            </div>
            <div className="mt-3 text-[28px] font-black text-[var(--plum-deep)] leading-tight">Instant Help</div>
            <div className="text-[14px] font-bold text-[var(--plum-deep)]/75 mt-1">A specialist on the way in minutes.</div>
            <div className="mt-5 inline-flex items-center gap-2 text-[var(--plum-deep)] font-extrabold text-[14px]">
              Get help now <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>

        <button
          onClick={() => p.setScreen("client-schedule")}
          className="w-full rounded-[28px] plum-gradient p-6 shadow-soft text-left active:scale-[0.99] transition relative overflow-hidden"
        >
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/5" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--sunshine)] text-[var(--plum-deep)] text-[10px] font-black uppercase tracking-wider">
              <Calendar className="w-3 h-3" /> Plan ahead
            </div>
            <div className="mt-3 text-[28px] font-black text-white leading-tight">Schedule a Pro</div>
            <div className="text-[14px] font-bold text-white/70 mt-1">Pick the day and time that work for you.</div>
            <div className="mt-5 inline-flex items-center gap-2 text-[var(--sunshine)] font-extrabold text-[14px]">
              Book a slot <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>

        <div className="mt-2 px-1 flex items-center gap-2 text-[12px] text-[var(--plum-deep)]/55 font-bold">
          <ShieldCheck className="w-4 h-4 text-[var(--success)]" />
          Vetted specialists. Secure payments. Money-back guarantee.
        </div>
      </div>

      <ClientBottomNav active="home" setScreen={p.setScreen} />
    </div>
  );
}

function setBookingFlow(p: RouterProps, scheduled: boolean) {
  p.setBooking({ photos: 0, scheduled: scheduled ? new Date().toISOString() : undefined });
  p.setScreen("client-categories");
}

/* ============================================================
   CLIENT — RATING MODAL (final Trust Score adjustment)
   ============================================================ */
/* ============================================================
   CLIENT — PRICE CONFIRM MODAL (anti-fraud cross-check)
   Shows after specialist submits their declared price.
   Client enters what they actually paid → discrepancy flag if mismatch.
   ============================================================ */
function ClientPriceConfirmModal({ p, close }: { p: RouterProps; close: () => void }) {
  const [clientPrice, setClientPrice] = useState("");
  const handymanN = p.handymanReportedPrice ?? 0;

  const finalise = (clientN: number | null, discrepancy: boolean) => {
    // Sync both prices + discrepancy to Supabase booking record.
    // handymanN is already written; this call adds the client side.
    dbSavePrices(p.activeBookingId, handymanN, clientN, discrepancy);
    // Increment client completed jobs count — locally and in DB.
    const newCount = p.clientJobCount + 1;
    p.setClientJobCount(newCount);
    if (p.clientUserId) dbIncrementClientJobCount(p.clientUserId, p.clientJobCount);
    // Clear booking reference now that all writes are queued.
    p.setActiveBookingId(null);
    p.setClientPricePrompt(false);
    p.setHandymanReportedPrice(null);
    p.setRatingPrompt(true);
    close();
  };

  const submit = () => {
    const clientN = parseFloat(clientPrice);
    if (isNaN(clientN) || clientN <= 0) return;
    const discrepancy = Math.abs(clientN - handymanN) > 0.5; // $0.50 tolerance
    if (discrepancy) {
      toast("⚠️ Price discrepancy flagged", {
        description: `Specialist reported $${handymanN.toFixed(2)}, you reported $${clientN.toFixed(2)}. Flagged for admin audit — no action needed from you.`,
        duration: 7000,
      });
    } else {
      toast.success("Amount confirmed ✓", {
        description: `Both parties agreed on $${clientN.toFixed(2)}. Transaction verified.`,
      });
    }
    finalise(clientN, discrepancy);
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/50 flex items-end" onClick={close}>
      <div className="w-full bg-white rounded-t-3xl p-5 slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1.5 rounded-full bg-[var(--beige-border)] mx-auto mb-4" />
        <div className="text-[18px] font-black text-[var(--plum-deep)]">Confirm what you paid</div>
        <div className="mt-1.5 text-[13px] font-semibold text-[var(--plum-deep)]/65 leading-snug">
          Your specialist logged <span className="font-black text-[var(--plum-deep)]">${handymanN.toFixed(2)}</span>.
          Enter the total you actually paid to cross-verify the transaction.
        </div>
        <div className="mt-4 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-black text-[var(--plum-deep)]/40">$</span>
          <input
            inputMode="decimal"
            value={clientPrice}
            onChange={(e) => setClientPrice(e.target.value)}
            placeholder="0.00"
            className="w-full h-16 pl-10 pr-4 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-black text-[28px] focus:outline-none focus:border-[var(--sunshine-deep)]"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => finalise(null, false)} // skip still closes the booking + increments count
            className="h-12 rounded-xl bg-[var(--cream)] text-[var(--plum-deep)] font-extrabold text-[13px]"
          >
            Skip for now
          </button>
          <button
            onClick={submit}
            disabled={!clientPrice}
            className="h-12 rounded-xl plum-gradient text-white font-extrabold text-[13px] disabled:opacity-40"
          >
            Confirm amount
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientRatingModal({ p, close }: { p: RouterProps; close: () => void }) {
  const [stars, setStars] = useState(0);
  const [scam, setScam] = useState(false);
  const submit = () => {
    if (stars === 0 && !scam) return;
    // Rating → Trust Score delta. 5★ can override an "overpriced" penalty (+2 reward).
    let delta = 0;
    if (scam) delta = -10;
    else if (stars === 5) delta = +2;
    else if (stars === 4) delta = +1;
    else if (stars === 3) delta = 0;
    else if (stars === 2) delta = -1;
    else if (stars === 1) delta = -3;
    let copy = "";
    if (scam) {
      copy = "Scam reported — Trust Score penalised and case routed to safety review.";
    } else if (stars === 5 && p.lastEval?.overpriced) {
      // Premium-work override: client confirms the price was justified.
      delta = +2;
      copy = "5★ confirms premium work — pricing penalty overridden, +2 to Trust Score.";
    } else if (delta > 0) {
      copy = `Thanks! +${delta} to your specialist's Trust Score.`;
    } else if (delta < 0) {
      copy = `Feedback logged. ${delta} to Trust Score.`;
    } else {
      copy = "Feedback received.";
    }
    p.setTrustScore(Math.max(0, Math.min(100, p.trustScore + delta)));
    p.setLastEval(null);
    p.setRatingPrompt(false);
    toast.success("Rating submitted", { description: copy });
    close();
  };
  return (
    <div className="absolute inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={close}>
      <div className="w-full max-w-[380px] bg-white rounded-3xl p-6 slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="text-[18px] font-black text-[var(--plum-deep)]">Rate your specialist</div>
        <div className="text-[12px] font-semibold text-[var(--plum-deep)]/65 mt-1">Your honest feedback shapes their Trust Score.</div>
        <div className="mt-4 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => { setStars(n); setScam(false); }} className="p-1 active:scale-90 transition">
              <Star className={`w-9 h-9 ${n <= stars ? "text-[var(--sunshine-deep)] fill-[var(--sunshine-deep)]" : "text-[var(--plum-deep)]/25"}`} />
            </button>
          ))}
        </div>
        <button
          onClick={() => { setScam((v) => !v); if (!scam) setStars(0); }}
          className={`mt-4 w-full h-11 rounded-xl text-[12px] font-black uppercase tracking-wider transition ${
            scam ? "bg-[var(--destructive)] text-white" : "bg-white border border-[var(--beige-border)] text-[var(--destructive)]"
          }`}
        >
          {scam ? "✓ Scam reported" : "Report scam / serious issue"}
        </button>
        <div className="mt-5 flex gap-2">
          <button onClick={close} className="flex-1 h-12 rounded-xl bg-[var(--cream)] text-[var(--plum-deep)] font-black text-[13px]">Later</button>
          <button onClick={submit} disabled={stars === 0 && !scam} className="flex-1 h-12 rounded-xl bg-[var(--plum-deep)] text-white font-black text-[13px] disabled:opacity-40">Submit</button>
        </div>
      </div>
    </div>
  );
}



/* ============================================================
   CLIENT — CATEGORIES
   ============================================================ */
function ClientCategories(p: RouterProps) {
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="What do you need?" onBack={() => p.setScreen(p.booking.scheduled ? "client-schedule" : "client-home")} />
      <div className="px-5 pb-2">
        <p className="text-[14px] text-[var(--plum-deep)]/60 font-semibold">Tap a category — we'll continue automatically.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const sel = p.booking.category === c.label;
            return (
              <button
                key={c.id}
                onClick={() => {
                  p.setBooking({ ...p.booking, category: c.label });
                  setTimeout(() => p.setScreen("client-details"), 180);
                }}
                className={`aspect-square rounded-2xl border-2 p-4 flex flex-col items-start justify-between transition active:scale-95 ${
                  sel ? "border-[var(--plum-deep)] bg-[var(--cream)]" : "border-[var(--beige-border)] bg-white"
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${sel ? "sunshine-gradient" : "bg-[var(--cream)]"}`}>
                  <Icon className="w-5 h-5 text-[var(--plum-deep)]" />
                </div>
                <div className="text-left">
                  <div className="text-[15px] font-extrabold text-[var(--plum-deep)]">{c.label}</div>
                  <div className="text-[11px] font-bold text-[var(--plum-deep)]/50 mt-0.5">From 10 min</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — DETAILS
   ============================================================ */
function ClientDetails(p: RouterProps) {
  const [mediaMode, setMediaMode] = useState<"photos" | "video">(
    p.booking.video ? "video" : "photos"
  );
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Job details" onBack={() => p.setScreen("client-categories")} />
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
        <div className="rounded-2xl bg-[var(--cream)] p-4 border border-[var(--beige-border)]">
          <div className="text-[11px] font-black text-[var(--plum-deep)]/55 uppercase tracking-wider">Your info</div>
          <div className="mt-2 space-y-1">
            <div className="text-[15px] font-extrabold text-[var(--plum-deep)]">{p.client.name || "Jane Cooper"}</div>
            <div className="text-[13px] font-semibold text-[var(--plum-deep)]/70 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> 142 Mission St, {p.client.city || "San Francisco"}
            </div>
            <div className="text-[13px] font-semibold text-[var(--plum-deep)]/70 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" /> {p.client.phone || "+1 555 0123"}
            </div>
          </div>
          <button className="mt-3 text-[12px] font-extrabold text-[var(--sunshine-deep)]">Edit address</button>
        </div>

        <div>
          <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Describe the issue</span>
          <textarea
            value={p.booking.description || ""}
            onChange={(e) => p.setBooking({ ...p.booking, description: e.target.value })}
            placeholder="E.g. The kitchen sink has been leaking since this morning..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)] resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider">Add media</span>
            <div className="flex p-0.5 rounded-lg bg-[var(--cream)] border border-[var(--beige-border)]">
              <button
                onClick={() => {
                  setMediaMode("photos");
                  p.setBooking({ ...p.booking, video: false });
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-extrabold transition ${mediaMode === "photos" ? "bg-white shadow-sm text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/45"}`}
              >3 Photos</button>
              <button
                onClick={() => {
                  setMediaMode("video");
                  p.setBooking({ ...p.booking, video: true, photos: 0 });
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-extrabold transition ${mediaMode === "video" ? "bg-white shadow-sm text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/45"}`}
              >1 Video</button>
            </div>
          </div>
          {mediaMode === "photos" ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => {
                const uploaded = i < p.booking.photos;
                return (
                  <button
                    key={i}
                    onClick={() => p.setBooking({ ...p.booking, photos: Math.min(3, p.booking.photos + 1) })}
                    className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 ${
                      uploaded ? "border-[var(--sunshine-deep)] bg-[var(--sunshine)]/20" : "border-[var(--beige-border)] bg-[var(--cream)]"
                    }`}
                  >
                    {uploaded ? (
                      <CheckCircle2 className="w-6 h-6 text-[var(--plum-deep)]" />
                    ) : (
                      <>
                        <Camera className="w-5 h-5 text-[var(--plum-deep)]/50" />
                        <span className="text-[10px] font-bold text-[var(--plum-deep)]/50">Add</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              onClick={() => p.setBooking({ ...p.booking, video: !p.booking.video })}
              className={`w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition ${
                p.booking.video ? "border-[var(--sunshine-deep)] bg-[var(--sunshine)]/20" : "border-[var(--beige-border)] bg-[var(--cream)]"
              }`}
            >
              {p.booking.video ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-[var(--plum-deep)]" />
                  <span className="text-[11px] font-bold text-[var(--plum-deep)]">Video attached</span>
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 text-[var(--plum-deep)]/50" />
                  <span className="text-[11px] font-bold text-[var(--plum-deep)]/50">Tap to attach a short video</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="plum" onClick={() => p.setScreen("client-triage")}>Continue</PrimaryBtn>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — TRIAGE
   ============================================================ */
function ClientTriage(p: RouterProps) {
  const [danger, setDanger] = useState(false);
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Safety check" onBack={() => p.setScreen("client-details")} />
      <div className="flex-1 px-5 py-4 flex flex-col">
        <div className="rounded-2xl border-2 border-[var(--beige-border)] p-5 bg-[var(--cream)]">
          <div className="w-12 h-12 rounded-xl sunshine-gradient flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-[var(--plum-deep)]" />
          </div>
          <h2 className="text-[20px] font-black text-[var(--plum-deep)] leading-tight">
            Do you smell gas, see smoke, or is water touching electricity?
          </h2>
          <p className="mt-2 text-[13px] font-semibold text-[var(--plum-deep)]/65">
            Your safety comes first. If any of these apply, do not proceed.
          </p>
        </div>

        {danger ? (
          <div className="mt-6 rounded-2xl bg-[var(--destructive)] p-6 text-white slide-up">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[18px] font-black">Call 911 immediately</div>
                <div className="text-[13px] font-semibold opacity-90">Get to a safe location first.</div>
              </div>
            </div>
            <button className="mt-5 w-full h-13 py-3.5 rounded-xl bg-white text-[var(--destructive)] font-black text-[15px]">
              Call 911 now
            </button>
            <button onClick={() => setDanger(false)} className="mt-2 w-full py-2 text-white/80 font-bold text-[13px]">
              Go back
            </button>
          </div>
        ) : (
          <div className="mt-auto space-y-3 pb-2">
            <PrimaryBtn variant="danger" onClick={() => setDanger(true)}>
              Yes, one of these applies
            </PrimaryBtn>
            <PrimaryBtn variant="plum" onClick={() => p.setScreen("client-checkout")}>
              No, continue safely
            </PrimaryBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — CHECKOUT
   ============================================================ */
function ClientCheckout(p: RouterProps) {
  // Loyalty engine: every 3rd completed booking earns a free service fee.
  const loyaltyWaiver = p.clientJobCount > 0 && p.clientJobCount % 3 === 0;
  const fee = loyaltyWaiver ? 0 : 5;
  const [method, setMethod] = useState<"apple" | "google" | "card">("apple");
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    p.setClientJobStartedAt(Date.now());
    // Simulate biometric verification (Face ID / Touch ID) — 1.5 s delay
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    // Live Supabase insert: job with status "open" + linked booking row
    await dbPostClientJob({
      clientId:    p.clientUserId,
      category:    p.booking.category   || "General",
      description: p.booking.description || "",
      city:        p.client.city         || "",
      jobType:     p.booking.scheduled ? "scheduled" : "instant",
      serviceFee:  fee,
      photos:      p.booking.photos,
      video:       p.booking.video,
    });
    if (p.booking.scheduled) {
      scheduleJobReminder({
        category:    p.booking.category || "Service",
        scheduledAt: p.booking.scheduled,
      });
      toast.success("Booking confirmed", {
        description: "We'll send you and your specialist a reminder 1 day before the job.",
        duration: 4500,
      });
    }
    setPaying(false);
    p.setScreen("client-tracking");
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Confirm & pay" onBack={() => p.setScreen("client-triage")} />
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
        <div className="rounded-2xl bg-[var(--cream)] p-4 border border-[var(--beige-border)]">
          <div className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">Summary</div>
          <div className="mt-2 flex items-center justify-between">
            <div className="font-extrabold text-[var(--plum-deep)]">{p.booking.category}</div>
            <div className="text-[12px] font-bold text-[var(--plum-deep)]/60">{p.booking.scheduled ? "Scheduled" : "Instant"}</div>
          </div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/65 line-clamp-2">
            {p.booking.description || "Standard service request."}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[var(--beige-border)] p-4 space-y-2">
          <Row label="Booking fee" value={loyaltyWaiver ? "$0.00" : "$5.00"} />
          <Row label="Service estimate" value="Paid to specialist" muted />
          {loyaltyWaiver && (
            <div className="rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/25 px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" />
              <span className="text-[12px] font-extrabold text-[var(--success)]">Loyalty reward — service fee waived!</span>
            </div>
          )}
          <div className="h-px bg-[var(--beige-border)] my-2" />
          <Row label="Due now" value={fee === 0 ? "FREE" : `$${fee.toFixed(2)}`} bold />
        </div>

        <div>
          <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55 mb-2">Payment method</div>
          <div className="grid grid-cols-3 gap-2">
            <PayOption active={method === "apple"} onClick={() => setMethod("apple")}>
              <div className="text-[18px] font-black tracking-tight"></div>
              <div className="text-[11px] font-black mt-0.5">Pay</div>
            </PayOption>
            <PayOption active={method === "google"} onClick={() => setMethod("google")}>
              <div className="flex items-center gap-1 text-[13px] font-black">
                <span className="text-[#4285F4]">G</span>
                <span className="text-[#EA4335]">o</span>
                <span className="text-[#FBBC05]">o</span>
                <span className="text-[#4285F4]">g</span>
                <span className="text-[#34A853]">l</span>
                <span className="text-[#EA4335]">e</span>
              </div>
              <div className="text-[11px] font-black mt-0.5">Pay</div>
            </PayOption>
            <PayOption active={method === "card"} onClick={() => setMethod("card")}>
              <CreditCard className="w-5 h-5" />
              <div className="text-[10px] font-black mt-1">Card</div>
            </PayOption>
          </div>
        </div>

        {method === "card" && (
          <div className="rounded-2xl border border-[var(--beige-border)] p-4 bg-white space-y-3 chat-pop">
            <div className="rounded-xl plum-gradient p-4 text-white relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-[var(--sunshine)]/15" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">REDDY Card</div>
              <div className="mt-6 text-[18px] font-black tracking-[0.2em]">{cardNum || "•••• •••• •••• ••••"}</div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase text-white/60">Holder</div>
                  <div className="text-[11px] font-extrabold">{p.client.name || "Cardholder"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase text-white/60">Exp</div>
                  <div className="text-[11px] font-extrabold">{cardExp || "MM/YY"}</div>
                </div>
              </div>
            </div>
            <input value={cardNum} onChange={(e) => setCardNum(e.target.value)} placeholder="Card number" className="w-full h-12 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)]" />
            <div className="grid grid-cols-2 gap-2">
              <input value={cardExp} onChange={(e) => setCardExp(e.target.value)} placeholder="MM / YY" className="h-12 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)]" />
              <input value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="CVC" className="h-12 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)]" />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-[12px] text-[var(--plum-deep)]/60 font-semibold">
          <ShieldCheck className="w-4 h-4 text-[var(--success)] mt-0.5 flex-shrink-0" />
          Booking fee is fully refunded if no specialist accepts within 15 minutes.
        </div>
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn
          variant={method === "apple" ? "plum" : "sunshine"}
          disabled={paying}
          onClick={handlePay}
        >
          {paying ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin inline-block" />
              Verifying…
            </span>
          ) : method === "apple" ? (
            `  Pay  $${fee.toFixed(2)}`
          ) : method === "google" ? (
            `Pay $${fee.toFixed(2)} with Google Pay`
          ) : (
            `Pay $${fee.toFixed(2)} & find specialist`
          )}
        </PrimaryBtn>
      </div>
    </div>
  );
}

function PayOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center transition active:scale-95 ${
        active ? "border-[var(--plum-deep)] bg-[var(--plum-deep)] text-white shadow-soft" : "border-[var(--beige-border)] bg-white text-[var(--plum-deep)]"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className={`text-[14px] ${bold ? "font-black text-[var(--plum-deep)]" : "font-semibold text-[var(--plum-deep)]/70"}`}>{label}</div>
      <div className={`text-[14px] ${bold ? "font-black text-[var(--plum-deep)]" : muted ? "font-semibold text-[var(--plum-deep)]/50" : "font-bold text-[var(--plum-deep)]"}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   CLIENT — TRACKING
   ============================================================ */
function ClientTracking(p: RouterProps) {
  // phase: 0 = searching (waiting for Realtime), 4 = specialist found (confirm card),
  //        5 = confirmed → routing to chat, 6 = en route (live map), 7 = expired (no match).
  // If activeBookingId is already set when this component mounts (because ClientView's
  // Realtime listener fired while the client was on another screen), jump straight to
  // phase 4 so the specialist card renders immediately instead of showing "searching".
  const [phase, setPhase] = useState<number>(() => p.activeBookingId ? 4 : 0);
  // searchElapsed counts seconds from when this screen mounted (or last decline/restart).
  // It drives the radius label and DispatchRow highlights without any fake setTimeout.
  const [searchElapsed, setSearchElapsed] = useState(0);
  const [declineRound, setDeclineRound] = useState(0);
  const [markerOffset, setMarkerOffset] = useState(0);
  const searchStartMs = useRef<number>(safeMs(p.clientJobStartedAt));

  // Real Option-B radius clock: ticks every second while in searching state.
  // Transitions: 3 km (0–60 s) → 7 km (60–120 s) → 15 km (120–180 s) → expired.
  // Functional setter on phase ensures a late tick at t=180s can never overwrite
  // a Realtime-driven transition to phase 4 (specialist found) with phase 7 (expired).
  // Clock is anchored to clientJobStartedAt (set in handlePay) so both client and
  // specialist derive elapsed time from the same DB-anchored job creation moment.
  useEffect(() => {
    if (phase !== 0) return;
    const t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - searchStartMs.current) / 1000);
      setSearchElapsed(elapsed);
      if (elapsed >= 180) setPhase((prev) => (prev === 0 ? 7 : prev));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // React to activeBookingId being set by the ClientView-level Realtime listener.
  // Covers the case where ClientTracking IS mounted when the specialist accepts
  // (useState lazy init above covers the freshly-mounted case).
  useEffect(() => {
    if (p.activeBookingId) {
      setPhase((prev) => (prev < 4 ? 4 : prev));
    }
  }, [p.activeBookingId]);

  // Sync live map once specialist taps "I'm on my way".
  useEffect(() => {
    if (phase === 5 && p.enRoute) setPhase(6);
  }, [phase, p.enRoute]);

  // Animate the moving specialist marker once assigned (phase ≥ 4).
  useEffect(() => {
    if (phase < 4) return;
    const i = setInterval(() => setMarkerOffset((v) => (v + 14) % 140), 1000);
    return () => clearInterval(i);
  }, [phase]);

  const declineSpecialist = () => {
    if (declineRound < 2) {
      setDeclineRound((r) => r + 1);
      searchStartMs.current = Date.now(); // restart fresh 3-minute search window on decline
      setSearchElapsed(0);
      setPhase(0);
    } else {
      setPhase(7);
    }
  };

  const confirmSpecialist = () => {
    setPhase(5);
    p.setScreen("client-chat");
  };

  // Derive radius and which DispatchRow is active from the live elapsed counter.
  const radius = searchElapsed < 60 ? 3 : searchElapsed < 120 ? 7 : 15;
  const dispatchPhase = searchElapsed < 60 ? 0 : searchElapsed < 120 ? 1 : 2;
  const alternativesCount = declineRound === 0 ? 1 : declineRound === 1 ? 2 : 3;
  const matched = phase >= 4;
  const liveMap = phase >= 4; // show map as soon as specialist is assigned, not just en route

  const status =
    phase === 0 ? `Scanning specialists within ${radius} km…`
    : phase === 4 ? "Specialist found — confirm to continue"
    : phase === 5 ? "Connecting to specialist…"
    : phase === 6 ? "Specialist is on the way"
    : "No match — try again in 15 minutes";

  return (
    <div className="flex flex-col h-full bg-white slide-up relative">
      <TopBar title="Live tracking" onBack={() => p.setScreen("client-home")} />

      <div className="relative h-[300px] bg-[var(--cream)] mx-5 rounded-3xl overflow-hidden border border-[var(--beige-border)]">
        {liveMap ? (
          <MockMap markerOffset={markerOffset} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-gradient-to-b from-[var(--cream)] to-white">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full sunshine-gradient map-pulse opacity-60" />
              <div className="relative w-16 h-16 rounded-full sunshine-gradient flex items-center justify-center shadow-glow">
                <Radar className="w-7 h-7 text-[var(--plum-deep)]" />
              </div>
            </div>
            <div className="mt-4 text-[13px] font-extrabold text-[var(--plum-deep)]">
              {phase === 0 ? "Searching the best match for your slot…" : phase === 7 ? "No match available right now" : "Live map activates once specialist departs"}
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur shadow-soft text-[12px] font-extrabold text-[var(--plum-deep)] flex items-center gap-1.5 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" /> Smart Radius · {radius} km
        </div>
      </div>

      <div className="px-5 mt-4">
        <div className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">{status}</div>
        <div className="mt-1 text-[22px] font-black text-[var(--plum-deep)]">
          {phase === 7 ? "Try again in 15 min" : !matched ? "Hold tight…" : "Specialist Assigned"}
        </div>

        {phase === 0 && (
          <div className="mt-4 space-y-2">
            <DispatchRow active={dispatchPhase === 0} done={dispatchPhase > 0} label="Phase 1 — 3 km radius (0–60 s)" sub="Platinum & Gold tier first" />
            <DispatchRow active={dispatchPhase === 1} done={dispatchPhase > 1} label="Phase 2 — Expanding to 7 km (60–120 s)" sub="Silver & Bronze included" />
            <DispatchRow active={dispatchPhase === 2} done={false} label="Phase 3 — Final sweep 15 km (120–180 s)" sub="Maximum match attempt" />
          </div>
        )}

        {phase === 4 && (
          <div className="mt-4 chat-pop rounded-2xl bg-white border border-[var(--beige-border)] p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <SpecAvatar name="Specialist" size={56} />
              <div className="flex-1">
                <div className="font-extrabold text-[var(--plum-deep)]">Specialist Assigned</div>
                <div className="flex items-center gap-2 mt-0.5 text-[12px] font-bold text-[var(--plum-deep)]/65">
                  <Star className="w-3.5 h-3.5 fill-[var(--sunshine)] text-[var(--sunshine-deep)]" /> Verified Pro
                  <span className="text-[var(--plum-deep)]/30">•</span>
                  <Navigation className="w-3.5 h-3.5" /> {radius} km
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-[var(--sunshine-deep)]">
                  Showing {alternativesCount} {alternativesCount === 1 ? "best match" : "alternative(s)"}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={declineSpecialist} className="h-11 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] font-extrabold text-[13px] text-[var(--plum-deep)]">
                Decline
              </button>
              <button onClick={confirmSpecialist} className="h-11 rounded-xl plum-gradient text-white font-extrabold text-[13px]">
                Confirm & chat
              </button>
            </div>
            <div className="mt-2 text-[11px] font-semibold text-[var(--plum-deep)]/55 text-center">
              They'll send their price estimate inside chat.
            </div>
          </div>
        )}

        {phase === 6 && (
          <div className="mt-4 chat-pop rounded-2xl bg-white border border-[var(--beige-border)] p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <SpecAvatar name="Specialist" size={56} />
              <div className="flex-1">
                <div className="font-extrabold text-[var(--plum-deep)]">Specialist En Route</div>
                <div className="flex items-center gap-2 mt-0.5 text-[12px] font-bold text-[var(--plum-deep)]/65">
                  <Star className="w-3.5 h-3.5 fill-[var(--sunshine)] text-[var(--sunshine-deep)]" /> Verified Pro · En route
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold text-[var(--plum-deep)]/55">ETA</div>
                <div className="text-[16px] font-black text-[var(--plum-deep)]">9 min</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => p.setScreen("client-spec-profile")} className="h-12 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] font-extrabold text-[13px] text-[var(--plum-deep)] flex items-center justify-center gap-2">
                <User className="w-4 h-4" /> View Profile
              </button>
              <button onClick={() => p.setScreen("client-chat")} className="h-12 rounded-xl plum-gradient text-white font-extrabold text-[13px] flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> Chat
              </button>
            </div>
          </div>
        )}

        {phase === 7 && (
          <div className="mt-4 rounded-2xl border-2 border-[var(--sunshine-deep)] bg-[var(--sunshine)]/15 p-4">
            <div className="text-[14px] font-extrabold text-[var(--plum-deep)]">No specialist available right now</div>
            <div className="mt-1 text-[12px] font-semibold text-[var(--plum-deep)]/70">
              No match found within 15 km in the 2-minute window. Please try again shortly.
            </div>
            <button onClick={() => p.setScreen("client-home")} className="mt-3 w-full h-11 rounded-xl plum-gradient text-white font-extrabold text-[13px]">
              Back to home
            </button>
          </div>
        )}
      </div>

      <div className="mt-auto px-5 pb-8">
        <button
          onClick={() => p.setScreen("client-home")}
          className="w-full text-center py-3 text-[13px] font-bold text-[var(--plum-deep)]/55"
        >
          Cancel request
        </button>
      </div>
    </div>
  );
}

function DispatchRow({ active, done, label, sub }: { active: boolean; done: boolean; label: string; sub: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition ${
      active ? "border-[var(--sunshine-deep)] bg-[var(--sunshine)]/10" : done ? "border-[var(--beige-border)] bg-white" : "border-[var(--beige-border)] bg-white opacity-60"
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
        done ? "bg-[var(--success)] text-white" : active ? "sunshine-gradient text-[var(--plum-deep)]" : "bg-[var(--beige)] text-[var(--plum-deep)]/50"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Radar className="w-4 h-4 animate-pulse" /> : <Clock className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-extrabold text-[var(--plum-deep)]">{label}</div>
        <div className="text-[11px] font-bold text-[var(--plum-deep)]/55">{sub}</div>
      </div>
    </div>
  );
}

function LowTierModal({ onWait, onProceed }: { onWait: () => void; onProceed: () => void }) {
  return (
    <div className="absolute inset-0 z-40 bg-[var(--plum-deep)]/60 backdrop-blur-sm flex items-end justify-center p-4">
      <div className="w-full bg-white rounded-3xl p-6 chat-pop shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--destructive)]/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-[var(--destructive)]" />
          </div>
          <div>
            <div className="text-[18px] font-black text-[var(--plum-deep)] leading-tight">Safety Alert</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/70 leading-snug">
              Only Standard-Tier specialists (Trust Score &lt; 60) are available in your immediate radius right now. Would you like to wait longer for a Premium Specialist, or proceed now with Premium Support Insurance?
            </div>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <PrimaryBtn variant="plum" onClick={onWait}>Wait for Premium Specialist</PrimaryBtn>
          <PrimaryBtn variant="sunshine" onClick={onProceed}>Proceed with Premium Insurance</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function SpecAvatar({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-2xl plum-gradient flex items-center justify-center text-white font-black flex-shrink-0 relative overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      <div className="absolute inset-0 sunshine-gradient opacity-90" />
      <span className="relative text-[var(--plum-deep)]">{name[0]}</span>
    </div>
  );
}

function SpecialistDetailScreen(p: RouterProps) {
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Specialist profile" onBack={() => p.setScreen("client-tracking")} />
      <div className="flex-1 overflow-y-auto">
        <div className="px-5">
          <div className="rounded-3xl plum-gradient p-6 text-white relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[var(--sunshine)]/20" />
            <div className="relative flex items-center gap-4">
              <SpecAvatar name="Marcus" size={84} />
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--sunshine)] text-[var(--plum-deep)] text-[10px] font-black uppercase tracking-wider">
                  <Award className="w-3 h-3" /> Platinum Tier
                </div>
                <div className="mt-1.5 text-[22px] font-black leading-tight">Marcus Bennett</div>
                <div className="text-[12px] font-bold text-white/70">Plumbing Specialist · 8 yrs</div>
                <div className="mt-1 flex items-center gap-1 text-[12px] font-bold text-[var(--sunshine)]">
                  <Star className="w-3.5 h-3.5 fill-[var(--sunshine)]" /> 4.9 · 312 jobs · Trust 96
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 mt-4 grid grid-cols-3 gap-2">
          <Stat icon={Star} value="4.9" label="Rating" />
          <Stat icon={Briefcase} value="312" label="Jobs" />
          <Stat icon={TrendingUp} value="98%" label="On-Time" />
        </div>

        <div className="px-5 mt-4">
          <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55 mb-2">About</div>
          <div className="rounded-2xl border border-[var(--beige-border)] p-4 text-[13px] font-semibold text-[var(--plum-deep)]/75 leading-relaxed">
            Licensed master plumber with 8+ years of residential and emergency repair experience. Same-day diagnostics, transparent quotes, and a 30-day workmanship guarantee on every job.
          </div>
        </div>

        <div className="px-5 mt-4">
          <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55 mb-2">Verifications</div>
          <div className="rounded-2xl border border-[var(--beige-border)] divide-y divide-[var(--beige-border)]">
            {[
              { l: "ID & background check", v: true },
              { l: "Profile photo verified", v: true },
              { l: "License & insurance", v: true },
              { l: "References (3 uploaded)", v: true },
            ].map((it) => (
              <div key={it.l} className="flex items-center justify-between p-3.5">
                <span className="text-[13px] font-semibold text-[var(--plum-deep)]/80">{it.l}</span>
                <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 mt-4 mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (p.booking.scheduled) {
                // Lock client into chat-first flow for scheduled bookings
                p.setChatLock({ specId: "marcus-bennett", name: "Marcus Bennett" });
              }
              p.setScreen("client-chat");
            }}
            className="h-12 rounded-xl sunshine-gradient font-black text-[13px] text-[var(--plum-deep)] flex items-center justify-center gap-2 shadow-glow"
          >
            <MessageCircle className="w-4 h-4" /> {p.booking.scheduled ? "Chat & Confirm" : "Chat"}
          </button>
          <button onClick={() => p.setScreen("client-tracking")} className="h-12 rounded-xl plum-gradient text-white font-extrabold text-[13px] flex items-center justify-center gap-2">
            <Navigation className="w-4 h-4" /> Back to tracking
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatMsg { id: number; me: boolean; text: string; time: string }
function ChatScreen(p: RouterProps & { who: "client" | "specialist" }) {
  const isClient = p.who === "client";
  const peerName = isClient ? "Specialist" : (p.activeJob?.client || "Client");
  const back: Screen = isClient ? (p.chatLock ? "client-spec-profile" : "client-tracking") : "spec-active";
  const myId = isClient ? p.clientUserId : p.specUserId;
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs]);

  // Load message history + subscribe to Realtime for the active booking.
  // Gracefully does nothing when activeBookingId is null (mock flow).
  useEffect(() => {
    if (!p.activeBookingId) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("id, sender_role, text, created_at")
          .eq("booking_id", p.activeBookingId)
          .order("created_at");
        if (error) throw error;
        if (data && data.length > 0) {
          setMsgs(
            (data as { id: string; sender_role: string; text: string; created_at: string }[]).map(
              (row, i) => ({
                id: i + 1,
                me: row.sender_role === p.who,
                text: row.text,
                time: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              }),
            ),
          );
        }
      } catch {
        // messages table not yet created — stay in local-state mode.
      }
    })();

    // Realtime: deliver incoming messages from the other party instantly.
    // We skip our own echoes (sender_role === p.who) because send() already
    // adds them optimistically to local state.
    const channel = supabase
      .channel(`chat-${p.activeBookingId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `booking_id=eq.${p.activeBookingId}` },
        (payload) => {
          const row = payload.new as { id: string; sender_role: string; text: string; created_at: string };
          if (row.sender_role === p.who) return; // already rendered optimistically
          setMsgs((prev) => [
            ...prev,
            {
              id: Date.now(),
              me: false,
              text: row.text,
              time: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [p.activeBookingId, p.who]);

  const send = async () => {
    if (!text.trim()) return;
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msgText = text.trim();
    // Optimistic local add — always visible immediately regardless of DB status.
    setMsgs((m) => [...m, { id: Date.now(), me: true, text: msgText, time: ts }]);
    setText("");
    // Persist to Supabase — Realtime delivers it to the other party's screen.
    if (p.activeBookingId) {
      try {
        await supabase.from("messages").insert({
          booking_id:  p.activeBookingId,
          sender_id:   myId,
          sender_role: p.who,
          text:        msgText,
        });
      } catch (err) {
        console.warn("[REDDY] chat send failed:", err);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b border-[var(--beige-border)] bg-white">
        <button onClick={() => p.setScreen(back)} className="w-10 h-10 rounded-full bg-[var(--beige)] flex items-center justify-center active:scale-95 transition">
          <ArrowLeft className="w-5 h-5 text-[var(--plum-deep)]" />
        </button>
        <SpecAvatar name={peerName} size={40} />
        <div className="flex-1">
          <div className="text-[15px] font-black text-[var(--plum-deep)] leading-tight">{peerName}</div>
          <div className="text-[11px] font-bold text-[var(--success)] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" /> Online
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-[var(--cream)]/40">
        {msgs.length === 0 && (
          <div className="flex items-center justify-center pt-16">
            <div className="text-[13px] font-semibold text-[var(--plum-deep)]/40">No messages yet. Say hello!</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.me ? "justify-end" : "justify-start"} chat-pop`}>
            <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] font-semibold leading-snug ${
              m.me ? "plum-gradient text-white rounded-br-md" : "bg-white text-[var(--plum-deep)] border border-[var(--beige-border)] rounded-bl-md"
            }`}>
              {m.text}
              <div className={`text-[10px] font-bold mt-0.5 ${m.me ? "text-white/60" : "text-[var(--plum-deep)]/40"}`}>{m.time}</div>
            </div>
          </div>
        ))}
      </div>

      {isClient && p.chatLock && (
        <div className="px-4 py-2.5 border-t border-[var(--beige-border)] bg-[var(--cream)]/60 flex items-center gap-2">
          <div className="flex-1 text-[11px] font-extrabold text-[var(--plum-deep)]/75 leading-tight">
            Locked into chat with <span className="font-black">{p.chatLock.name}</span>. Confirm to lock the booking, or Decline to release this specialist.
          </div>
          <button
            onClick={() => {
              p.setChatLock(null);
              toast("✅ Booking confirmed", { description: `${p.chatLock?.name} is locked in for your scheduled job.` });
              p.setScreen("client-checkout");
            }}
            className="h-9 px-3 rounded-lg bg-[var(--success)] text-white font-black text-[11px] uppercase tracking-wider"
          >Confirm</button>
          <button
            onClick={() => {
              p.setChatLock(null);
              toast("🔄 Searching for a new specialist", { description: "We're matching you with another pro now." });
              p.setScreen("client-tracking");
            }}
            className="h-9 px-3 rounded-lg bg-[var(--destructive)] text-white font-black text-[11px] uppercase tracking-wider"
          >Decline</button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-[var(--beige-border)] bg-white flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { void send(); } }}
          placeholder="Type a message…"
          className="flex-1 h-12 px-4 rounded-full bg-[var(--cream)] border border-[var(--beige-border)] font-semibold focus:outline-none focus:border-[var(--sunshine-deep)]"
        />
        <button onClick={() => { void send(); }} className="w-12 h-12 rounded-full sunshine-gradient flex items-center justify-center shadow-glow active:scale-95">
          <ArrowRight className="w-5 h-5 text-[var(--plum-deep)]" />
        </button>
      </div>
    </div>
  );
}



function MockMap({ markerOffset = 0 }: { markerOffset?: number }) {
  // Fully interactive map — users can zoom (scroll/pinch), pan, and follow routing path.
  const bbox = "-122.4244,37.7649,-122.3944,37.7949";
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=37.7799,-122.4094`;
  return (
    <div className="absolute inset-0">
      <iframe
        title="Live map"
        src={src}
        className="absolute inset-0 w-full h-full border-0"
        loading="lazy"
        allow="geolocation"
      />
      {/* dashed route line overlay — shortest path */}
      <svg viewBox="0 0 400 340" className="absolute inset-0 w-full h-full pointer-events-none">
        <path
          d={`M${70 + markerOffset},250 Q200,210 280,180`}
          stroke="#2B2640" strokeWidth="4" strokeDasharray="6 6" fill="none" strokeLinecap="round" opacity="0.7"
        />
      </svg>
      {/* destination pin */}
      <div className="absolute pointer-events-none" style={{ left: "70%", top: "52%", transform: "translate(-50%,-100%)" }}>
        <div className="w-7 h-7 rounded-full bg-[var(--plum-deep)] border-[3px] border-white shadow-soft flex items-center justify-center">
          <MapPin className="w-3.5 h-3.5 text-[var(--sunshine)]" />
        </div>
      </div>
      {/* moving specialist marker */}
      <div
        className="absolute transition-all duration-1000 ease-linear pointer-events-none"
        style={{ left: `calc(18% + ${markerOffset}px)`, top: "73%", transform: "translate(-50%,-50%)" }}
      >
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full sunshine-gradient map-pulse" />
          <div className="relative w-7 h-7 rounded-full sunshine-gradient border-[3px] border-white shadow-glow flex items-center justify-center">
            <Navigation className="w-3 h-3 text-[var(--plum-deep)]" />
          </div>
        </div>
      </div>
      {/* zoom hint */}
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-white/90 backdrop-blur text-[10px] font-black uppercase tracking-wider text-[var(--plum-deep)]/70 pointer-events-none">
        Pinch · scroll to zoom
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — SCHEDULE
   ============================================================ */
function ClientSchedule(p: RouterProps) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("10:00");
  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      return { i, label: d.toLocaleDateString("en", { weekday: "short" }), num: d.getDate() };
    });
  }, []);
  const slots = [
    "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30",
    "11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30",
    "15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30",
    "19:00","19:30","20:00",
  ];

  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Schedule a Pro" onBack={() => p.setScreen("client-home")} />
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-5">
        <div>
          <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55 mb-2">Date</div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => (
              <button
                key={d.i}
                onClick={() => setDay(d.i)}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 transition ${
                  d.i === day ? "plum-gradient text-white border-transparent" : "bg-white border-[var(--beige-border)] text-[var(--plum-deep)]"
                }`}
              >
                <span className="text-[10px] font-bold uppercase opacity-70">{d.label}</span>
                <span className="text-[16px] font-black">{d.num}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">Time</div>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-9 px-3 rounded-lg bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-extrabold text-[13px] focus:outline-none focus:border-[var(--sunshine-deep)]"
            />
          </div>
          <div className="grid grid-cols-4 gap-1.5 max-h-[210px] overflow-y-auto pr-1">
            {slots.map((s) => (
              <button
                key={s}
                onClick={() => setTime(s)}
                className={`h-10 rounded-lg border-2 font-extrabold text-[13px] transition ${
                  s === time ? "sunshine-gradient text-[var(--plum-deep)] border-transparent" : "bg-white border-[var(--beige-border)] text-[var(--plum-deep)]"
                }`}
              >{s}</button>
            ))}
          </div>
          <div className="mt-2 text-[11px] font-semibold text-[var(--plum-deep)]/55">
            Or type any custom time using the picker above.
          </div>
        </div>
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="plum" onClick={() => {
          const d = new Date();
          d.setDate(d.getDate() + day);
          const [hh, mm] = time.split(":").map(Number);
          d.setHours(hh || 0, mm || 0, 0, 0);
          p.setBooking({ photos: 0, scheduled: d.toISOString() });
          p.setScreen("client-categories");
        }}>Continue · {time}</PrimaryBtn>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENT — ACTIVITY
   ============================================================ */
function ClientActivity(p: RouterProps) {
  const items = [
    { id: 1, cat: "Plumbing", date: "Today, 09:12", status: "In Progress", color: "bg-[var(--sunshine)] text-[var(--plum-deep)]" },
    { id: 2, cat: "Cleaning", date: "Mar 18, 14:00", status: "Completed", color: "bg-[var(--success)] text-white" },
    { id: 3, cat: "Electrical", date: "Mar 12, 11:30", status: "Completed", color: "bg-[var(--success)] text-white" },
    { id: 4, cat: "Handyman", date: "Mar 03, 16:45", status: "Cancelled", color: "bg-[var(--beige)] text-[var(--plum-deep)]/70" },
  ];
  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <TopBar title="Your activity" brand />
      <div className="flex-1 overflow-y-auto px-5 space-y-3">
        {items.map((it) => {
          const inProgress = it.status === "In Progress";
          return (
            <button
              key={it.id}
              onClick={() => inProgress && p.setScreen("client-tracking")}
              disabled={!inProgress}
              className={`w-full text-left rounded-2xl bg-white border p-4 flex items-center gap-3 transition ${
                inProgress
                  ? "border-[var(--sunshine-deep)] shadow-glow active:scale-[0.99] cursor-pointer"
                  : "border-[var(--beige-border)] cursor-default"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-[var(--cream)] flex items-center justify-center">
                <Wrench className="w-5 h-5 text-[var(--plum-deep)]" />
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-[var(--plum-deep)]">{it.cat}</div>
                <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">{it.date}</div>
                {inProgress && (
                  <div className="text-[11px] font-black text-[var(--sunshine-deep)] mt-0.5 flex items-center gap-1">
                    <Navigation className="w-3 h-3" /> Tap to view live tracking
                  </div>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${it.color}`}>{it.status}</span>
            </button>
          );
        })}
      </div>
      <ClientBottomNav active="activity" setScreen={p.setScreen} />
    </div>
  );
}

/* ============================================================
   CLIENT — PROFILE
   ============================================================ */
function ClientProfileScreen(p: RouterProps) {
  const items = [
    { label: "Personal details", icon: User, to: "client-profile-personal" as Screen },
    { label: "Addresses", icon: MapPinned, to: "client-profile-addresses" as Screen },
    { label: "Help Center", icon: LifeBuoy, to: "client-profile-help" as Screen },
  ];
  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <TopBar title="Profile" />
      <div className="px-5">
        <div className="rounded-2xl plum-gradient p-5 text-white flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl sunshine-gradient flex items-center justify-center text-[26px] font-black text-[var(--plum-deep)]">
            {(p.client.name || "J")[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-black">{p.client.name || "Jane Cooper"}</div>
            <div className="text-[12px] font-bold text-white/70">{p.client.email || "jane@email.com"}</div>
          </div>
        </div>
      </div>
      <div className="px-5 mt-5 space-y-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.label} onClick={() => p.setScreen(it.to)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-[var(--beige-border)]">
              <div className="w-10 h-10 rounded-xl bg-[var(--cream)] flex items-center justify-center">
                <Icon className="w-5 h-5 text-[var(--plum-deep)]" />
              </div>
              <span className="flex-1 text-left font-extrabold text-[var(--plum-deep)]">{it.label}</span>
              <ChevronRight className="w-5 h-5 text-[var(--plum-deep)]/40" />
            </button>
          );
        })}
        <button
          onClick={() => { p.setRole(null); p.setScreen("gateway"); }}
          className="w-full mt-3 py-3 text-[13px] font-extrabold text-[var(--destructive)]"
        >
          Sign out
        </button>
      </div>
      <ClientBottomNav active="profile" setScreen={p.setScreen} />
    </div>
  );
}

function ProfilePersonal(p: RouterProps & { back: Screen }) {
  const isSpec = p.back === "spec-profile";
  const prof = isSpec ? p.specialist : p.client;
  const setProf = (v: any) => isSpec ? p.setSpecialist(v) : p.setClient(v);
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Personal details" onBack={() => p.setScreen(p.back)} />
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
        <Field label="Full name" value={prof.name} onChange={(v) => setProf({ ...prof, name: v })} />
        <Field label="Email" value={prof.email} onChange={(v) => setProf({ ...prof, email: v })} type="email" />
        <Field label="Phone" value={prof.phone} onChange={(v) => setProf({ ...prof, phone: v })} type="tel" />
        <Field label="City" value={prof.city} onChange={(v) => setProf({ ...prof, city: v })} />
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="plum" onClick={() => p.setScreen(p.back)}>Save changes</PrimaryBtn>
      </div>
    </div>
  );
}

function ProfileAddresses(p: RouterProps) {
  const [addrs, setAddrs] = useState([
    { id: 1, label: "Home", line: "142 Mission St, San Francisco, CA", primary: true },
    { id: 2, label: "Work", line: "525 Market St, Floor 18, San Francisco", primary: false },
  ]);
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Addresses" onBack={() => p.setScreen("client-profile")} />
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {addrs.map((a) => (
          <div key={a.id} className="rounded-2xl bg-white border border-[var(--beige-border)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--cream)] flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-[var(--plum-deep)]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-extrabold text-[var(--plum-deep)]">{a.label}</div>
                    {a.primary && <span className="px-2 py-0.5 rounded-full sunshine-gradient text-[10px] font-black uppercase text-[var(--plum-deep)]">Default</span>}
                  </div>
                  <div className="text-[13px] font-semibold text-[var(--plum-deep)]/65 mt-0.5">{a.line}</div>
                </div>
              </div>
              <button onClick={() => setAddrs(addrs.filter((x) => x.id !== a.id))} className="p-2 text-[var(--plum-deep)]/40">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setAddrs([...addrs, { id: Date.now(), label: "New", line: "Tap to edit address", primary: false }])}
          className="w-full h-14 rounded-2xl border-2 border-dashed border-[var(--beige-border)] flex items-center justify-center gap-2 font-extrabold text-[var(--plum-deep)]/60"
        >
          <Plus className="w-4 h-4" /> Add new address
        </button>
      </div>
    </div>
  );
}

function ProfileHelp(p: RouterProps & { back: Screen }) {
  const faqs = [
    { q: "How do specialists get matched?", a: "Based on niche, distance, and Trust Score we route the best available specialist to your job." },
    { q: "Is my booking fee refundable?", a: "Yes. If no specialist accepts within 15 minutes, the booking fee is fully refunded." },
    { q: "How do I report a problem?", a: "Tap Contact support below to chat or call our 24/7 team." },
    { q: "Can I tip my specialist?", a: "Tipping is optional and can be added after the job is marked complete." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  const [complaintCat, setComplaintCat] = useState("Service quality");
  const [complaintMsg, setComplaintMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMsgs, setSupportMsgs] = useState<{ id: number; me: boolean; text: string }[]>([
    { id: 1, me: false, text: "👋 Hi! You're chatting with REDDY Support. How can we help today?" },
  ]);
  const [supportDraft, setSupportDraft] = useState("");
  const sendSupport = () => {
    const t = supportDraft.trim();
    if (!t) return;
    const nextId = supportMsgs.length + 1;
    setSupportMsgs((m) => [...m, { id: nextId, me: true, text: t }]);
    setSupportDraft("");
    setTimeout(() => {
      setSupportMsgs((m) => [...m, { id: nextId + 1, me: false, text: "Got it — a REDDY agent is reviewing this now and will follow up in under 2 minutes." }]);
    }, 900);
  };
  const submit = () => {
    if (!complaintMsg.trim()) return;
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setComplaintMsg(""); }, 2400);
  };
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Help Center" onBack={() => p.setScreen(p.back)} />
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 pb-8">
        <div className="rounded-2xl plum-gradient p-5 text-white">
          <div className="text-[18px] font-black">Need a hand?</div>
          <div className="text-[13px] font-semibold text-white/70 mt-1">Our team replies in under 2 minutes.</div>
          <div className="mt-4">
            <button
              onClick={() => setSupportOpen(true)}
              className="w-full h-11 rounded-xl bg-[var(--sunshine)] text-[var(--plum-deep)] font-extrabold text-[13px] flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <MessageCircle className="w-4 h-4" /> Open Support Chat
            </button>
            <div className="mt-2 text-[11px] font-semibold text-white/70 text-center">In-app chat only — no phone lines.</div>
          </div>
        </div>

        {/* Complaints / Dispute form */}
        <div className="rounded-2xl border-2 border-[var(--destructive)]/25 bg-[var(--destructive)]/5 p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[var(--destructive)]/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-[var(--destructive)]" />
            </div>
            <div>
              <div className="text-[15px] font-black text-[var(--plum-deep)]">File a Complaint / Dispute</div>
              <div className="text-[11px] font-bold text-[var(--plum-deep)]/60">We review every report within 24 hours.</div>
            </div>
          </div>
          <div className="mt-3">
            <span className="block text-[11px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Category</span>
            <div className="relative">
              <select
                value={complaintCat}
                onChange={(e) => setComplaintCat(e.target.value)}
                className="w-full h-11 px-3 pr-9 rounded-xl bg-white border border-[var(--beige-border)] text-[var(--plum-deep)] font-bold text-[13px] appearance-none focus:outline-none focus:border-[var(--sunshine-deep)]"
              >
                {["Service quality", "Specialist conduct", "Pricing dispute", "Damage / Liability", "Safety concern", "Other"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--plum-deep)]/50 pointer-events-none" />
            </div>
          </div>
          <div className="mt-3">
            <span className="block text-[11px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Describe what happened</span>
            <textarea
              rows={3}
              value={complaintMsg}
              onChange={(e) => setComplaintMsg(e.target.value)}
              placeholder="Please share details, dates, and any reference numbers…"
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold text-[13px] focus:outline-none focus:border-[var(--sunshine-deep)] resize-none"
            />
          </div>
          <button
            onClick={submit}
            disabled={!complaintMsg.trim() || submitted}
            className="mt-3 w-full h-11 rounded-xl plum-gradient text-white font-extrabold text-[13px] disabled:opacity-50"
          >
            {submitted ? "✓ Complaint submitted" : "Submit complaint"}
          </button>
        </div>

        <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55 mt-3 px-1">FAQ</div>
        {faqs.map((f, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full text-left rounded-2xl bg-white border border-[var(--beige-border)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-[var(--plum-deep)] text-[14px]">{f.q}</span>
              <ChevronDown className={`w-4 h-4 text-[var(--plum-deep)]/50 transition ${open === i ? "rotate-180" : ""}`} />
            </div>
            {open === i && <div className="mt-2 text-[13px] font-semibold text-[var(--plum-deep)]/65 leading-snug">{f.a}</div>}
          </button>
        ))}
      </div>

      {supportOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-black/40" onClick={() => setSupportOpen(false)}>
          <div className="mt-auto bg-white rounded-t-3xl flex flex-col max-h-[80%]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--beige-border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl plum-gradient flex items-center justify-center text-white font-black">R</div>
                <div>
                  <div className="font-extrabold text-[var(--plum-deep)] text-[14px]">REDDY Support</div>
                  <div className="text-[11px] font-bold text-[var(--success)] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" /> Online · replies in ~1 min
                  </div>
                </div>
              </div>
              <button onClick={() => setSupportOpen(false)} className="w-8 h-8 rounded-full bg-[var(--cream)] flex items-center justify-center">
                <X className="w-4 h-4 text-[var(--plum-deep)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {supportMsgs.map((m) => (
                <div key={m.id} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] font-semibold ${
                    m.me ? "plum-gradient text-white rounded-br-md" : "bg-[var(--cream)] text-[var(--plum-deep)] rounded-bl-md"
                  }`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="px-3 py-3 border-t border-[var(--beige-border)] flex items-center gap-2">
              <input
                value={supportDraft}
                onChange={(e) => setSupportDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendSupport(); }}
                placeholder="Type a message…"
                className="flex-1 h-11 px-4 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold text-[13px] focus:outline-none focus:border-[var(--sunshine-deep)]"
              />
              <button onClick={sendSupport} className="h-11 px-4 rounded-xl plum-gradient text-white font-extrabold text-[13px]">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   KYC BLOCK MODAL
   ============================================================ */
function KycBlockModal({ verificationStatus, onClose, goToProfile }: {
  verificationStatus: string; onClose: () => void; goToProfile: () => void;
}) {
  const isPending = verificationStatus === "pending";
  return (
    <div className="absolute inset-0 z-50 bg-[var(--plum-deep)]/60 backdrop-blur-sm flex items-end justify-center p-4" onClick={onClose}>
      <div className="w-full bg-white rounded-3xl p-6 slide-up shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${isPending ? "sunshine-gradient" : "bg-[var(--destructive)]/10"}`}>
            <ShieldCheck className={`w-7 h-7 ${isPending ? "text-[var(--plum-deep)] animate-pulse" : "text-[var(--destructive)]"}`} />
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-black text-[var(--plum-deep)] leading-tight">
              {isPending ? "Verification in Progress" : "Account Not Verified"}
            </div>
            <div className="mt-1.5 text-[13px] font-semibold text-[var(--plum-deep)]/65 leading-snug">
              {isPending
                ? "Your account is under security review. Please wait — this usually takes under a minute."
                : "Your account is under security review. Complete identity verification to start accepting jobs."}
            </div>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          {!isPending && (
            <PrimaryBtn variant="sunshine" onClick={goToProfile}>
              Complete Verification <ChevronRight className="inline w-4 h-4 ml-1" />
            </PrimaryBtn>
          )}
          <PrimaryBtn variant="outline" onClick={onClose}>Close</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALIST — DASHBOARD
   ============================================================ */
function SpecDashboard(p: RouterProps) {
  const online = p.specOnline;
  const setOnline = (v: boolean) => p.setSpecOnline(v);
  const tier = p.trustScore >= 90 ? "Platinum" : p.trustScore >= 80 ? "Gold" : p.trustScore >= 70 ? "Silver" : "Bronze";
  const nextTier = p.trustScore >= 90 ? null : p.trustScore >= 80 ? 90 : p.trustScore >= 70 ? 80 : 70;
  const [kycBlockOpen, setKycBlockOpen] = useState(false);
  const isVerified = p.masterStatus === "active";

  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      {kycBlockOpen && (
        <KycBlockModal
          verificationStatus={p.verificationStatus}
          onClose={() => setKycBlockOpen(false)}
          goToProfile={() => { setKycBlockOpen(false); p.setScreen("spec-profile"); }}
        />
      )}
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <BrandMark size={44} />
        <div className="flex-1">
          <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">Welcome,</div>
          <div className="text-[18px] font-black text-[var(--plum-deep)]">{p.specialist.name || "Alex Morgan"}</div>
        </div>
        <SpecAlertButton count={p.alertsCount} onClick={() => p.setScreen("spec-alerts")} />
        <button
          onClick={() => {
            if (!isVerified) { setKycBlockOpen(true); return; }
            setOnline(!online);
          }}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-full font-black text-[11px] uppercase tracking-wider transition ${
            online && isVerified ? "bg-[var(--success)] text-white" : "bg-[var(--beige)] text-[var(--plum-deep)]/60"
          }`}
        >
          <Power className="w-3 h-3" /> {online && isVerified ? "On" : "Off"}
        </button>
      </div>

      {!isVerified && (
        <button
          onClick={() => p.setScreen("spec-profile")}
          className="mx-5 mb-3 rounded-xl bg-[var(--sunshine)]/20 border border-[var(--sunshine-deep)]/40 p-3 flex items-center gap-2 text-left active:scale-[0.99] transition"
        >
          <ShieldCheck className="w-4 h-4 flex-shrink-0 text-[var(--sunshine-deep)]" />
          <div className="flex-1 text-[12px] font-semibold text-[var(--plum-deep)]/80 leading-snug">
            {p.verificationStatus === "pending"
              ? "Identity verification in progress…"
              : <><span className="font-black">Complete verification</span> to start accepting jobs.</>}
          </div>
          {p.verificationStatus !== "pending" && <ChevronRight className="w-4 h-4 text-[var(--plum-deep)]/40 flex-shrink-0" />}
        </button>
      )}

      {!online && isVerified && (
        <div className="mx-5 mb-3 rounded-xl bg-[var(--beige)] border border-[var(--beige-border)] p-3 flex items-start gap-2">
          <Power className="w-4 h-4 mt-0.5 text-[var(--plum-deep)]/70" />
          <div className="text-[12px] font-semibold text-[var(--plum-deep)]/75 leading-snug">
            You're <span className="font-black">offline</span>. Job Radar is paused — flip to <span className="font-black">On</span> to receive new jobs.
          </div>
        </div>
      )}



      <div className="px-5 space-y-4">
        <div className="rounded-3xl plum-gradient p-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-[var(--sunshine)]/15" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[var(--sunshine)]" />
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--sunshine)]">Trust Score</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[44px] font-black leading-none">{p.trustScore}</span>
              <span className="text-[13px] font-bold text-white/70">/ 100 — {tier} Tier</span>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full sunshine-gradient rounded-full transition-all" style={{ width: `${p.trustScore}%` }} />
            </div>
            {nextTier && (
              <div className="mt-2 text-[12px] font-bold text-white/70">
                Reach {nextTier} for {nextTier === 90 ? "Platinum" : nextTier === 80 ? "Gold" : "Silver"} tier
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat icon={Star} value={p.completedJobs === 0 ? "0.0" : "4.9"} label="Rating" />
          <Stat icon={Briefcase} value={String(p.completedJobs)} label="Jobs Done" />
          <Stat icon={TrendingUp} value={p.completedJobs === 0 ? "—" : "98%"} label="On-Time" />
        </div>

        {/* Instant vs Scheduled completion analytics */}
        <div className="rounded-2xl bg-white border border-[var(--beige-border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">Jobs breakdown</div>
            <div className="text-[10px] font-extrabold text-[var(--plum-deep)]/45">Total {p.instantDone + p.scheduledDone}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl sunshine-gradient p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--plum-deep)]/70">
                <Zap className="w-3 h-3" /> Instant
              </div>
              <div className="mt-1 text-[26px] font-black text-[var(--plum-deep)] leading-none">{p.instantDone}</div>
              <div className="text-[10px] font-bold text-[var(--plum-deep)]/65 mt-0.5">Completed</div>
            </div>
            <div className="rounded-xl plum-gradient p-3 text-white">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--sunshine)]">
                <Calendar className="w-3 h-3" /> Scheduled
              </div>
              <div className="mt-1 text-[26px] font-black leading-none">{p.scheduledDone}</div>
              <div className="text-[10px] font-bold text-white/70 mt-0.5">Completed</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[var(--beige)] overflow-hidden flex">
            <div className="h-full sunshine-gradient" style={{ width: `${(p.instantDone / Math.max(1, p.instantDone + p.scheduledDone)) * 100}%` }} />
            <div className="h-full plum-gradient" style={{ width: `${(p.scheduledDone / Math.max(1, p.instantDone + p.scheduledDone)) * 100}%` }} />
          </div>
        </div>

        <div className="rounded-2xl sunshine-gradient p-5 shadow-glow">
          <div className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/70">Total earned</div>
          <div className="mt-1 text-[36px] font-black text-[var(--plum-deep)] leading-none">${p.totalEarned.toLocaleString()}</div>
          <div className="mt-1 text-[12px] font-bold text-[var(--plum-deep)]/70">Lifetime earnings on REDDY</div>
        </div>
      </div>

      <SpecBottomNav active="dashboard" setScreen={p.setScreen} />
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--beige-border)] p-3 text-center">
      <Icon className="w-4 h-4 mx-auto text-[var(--sunshine-deep)]" />
      <div className="mt-1 text-[18px] font-black text-[var(--plum-deep)]">{value}</div>
      <div className="text-[10px] font-bold text-[var(--plum-deep)]/55 uppercase tracking-wider">{label}</div>
    </div>
  );
}

/* ============================================================
   SPECIALIST — RADAR
   ============================================================ */
// PERSISTENT RADAR TIMERS: keyed by job id, survives component unmount so
// the countdown reflects real elapsed time when the user returns to Radar.
const RADAR_UNLOCK_AT: Record<string, number> = {};
function SpecRadar(p: RouterProps) {
  if (p.masterStatus !== "active") {
    return (
      <div className="flex flex-col h-full bg-white pb-24 slide-up">
        <TopBar title="Job Radar" />
        <div className="flex-1 px-5 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--destructive)]/10 flex items-center justify-center">
            <ShieldCheck className="w-9 h-9 text-[var(--destructive)]" />
          </div>
          <div className="mt-4 text-[18px] font-black text-[var(--plum-deep)]">Access Denied</div>
          <div className="mt-2 text-[13px] font-semibold text-[var(--plum-deep)]/60 max-w-[280px] leading-snug">
            {p.verificationStatus === "pending"
              ? "Your account is under security review. Radar will activate once verification is complete."
              : "Please verify your identity to access the Job Radar and accept jobs."}
          </div>
          <button
            onClick={() => p.setScreen("spec-profile")}
            className="mt-6 h-12 px-6 rounded-xl plum-gradient text-white font-extrabold text-[14px]"
          >
            {p.verificationStatus === "pending" ? "View Status" : "Complete Verification"}
          </button>
        </div>
        <SpecBottomNav active="radar" setScreen={p.setScreen} />
      </div>
    );
  }
  if (p.activeJob) {
    return (
      <div className="flex flex-col h-full bg-white pb-24 slide-up">
        <TopBar title="Active job in progress" />
        <div className="flex-1 px-5 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--sunshine)]/30 flex items-center justify-center">
            <Radar className="w-9 h-9 text-[var(--plum-deep)]" />
          </div>
          <div className="mt-4 text-[18px] font-black text-[var(--plum-deep)]">Radar paused</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/60 max-w-[260px]">
            Finish your current job to start receiving new requests.
          </div>
          <button onClick={() => p.setScreen("spec-active")} className="mt-5 h-12 px-6 rounded-xl plum-gradient text-white font-extrabold text-[14px]">
            Open active job
          </button>
        </div>
        <SpecBottomNav active="radar" setScreen={p.setScreen} />
      </div>
    );
  }
  if (!p.specOnline) {
    return (
      <div className="flex flex-col h-full bg-white pb-24 slide-up">
        <TopBar title="Job Radar" />
        <div className="flex-1 px-5 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--beige)] flex items-center justify-center">
            <Power className="w-9 h-9 text-[var(--plum-deep)]/60" />
          </div>
          <div className="mt-4 text-[18px] font-black text-[var(--plum-deep)]">Radar is off</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/60 max-w-[280px]">
            You set your status to Off. Job Radar auto-disabled — toggle <span className="font-black">On</span> from the dashboard to receive jobs again.
          </div>
          <button onClick={() => p.setScreen("spec-dashboard")} className="mt-5 h-12 px-6 rounded-xl plum-gradient text-white font-extrabold text-[14px]">
            Back to dashboard
          </button>
        </div>
        <SpecBottomNav active="radar" setScreen={p.setScreen} />
      </div>
    );
  }
  // ── PHASE 4: TIER DELAYS ─────────────────────────────────────────────────
  // Platinum (≥90): 0 s — sees jobs in the 3 km zone instantly.
  // Gold    (80-89): 20 s delay before jobs surface.
  // Silver  (70-79): 40 s delay.
  // Bronze   (<70):  60 s delay — same moment the radius expands to 7 km.
  const tierDelay =
    p.trustScore >= 90 ? 0 :
    p.trustScore >= 80 ? 20_000 :
    p.trustScore >= 70 ? 40_000 : 60_000;
  const isPlatinum = tierDelay === 0;

  // ── PHASE 4: LIVE SUPABASE JOBS ──────────────────────────────────────────
  const [liveJobs, setLiveJobs] = useState<RadarEntry[]>([]);

  useEffect(() => {
    if (!p.specUserId) return;
    const niche = p.specialist.niche;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("jobs")
          .select("id, category, description, city, job_type, status, created_at, added_at_ms, client_id")
          .eq("status", "open")
          .eq("category", niche);
        if (error) throw error;
        const entries: RadarEntry[] = (data as LiveJobDB[]).map((row) => ({
          id:        row.id,
          dbId:      row.id,
          clientId:  row.client_id ?? undefined,
          type:      row.job_type === "scheduled" ? "Scheduled" : "Instant",
          category:  row.category,
          // Deterministic mock distance derived from the job UUID so it stays
          // stable across re-renders without storing extra state.
          distance:  `${((parseInt(row.id.slice(-4), 16) % 25 + 3) / 10).toFixed(1)} km`,
          client:    "Client",
          note:      row.description,
          photos:    0,
          addedAtMs: safeMs(row.added_at_ms ?? row.created_at),
        }));
        setLiveJobs(entries);
      } catch (err) {
        console.warn("[REDDY] radar fetch failed:", err);
      }
    })();

    // Realtime: the moment any specialist accepts a job, vanish it from every
    // other specialist's radar screen instantly.
    const channel = supabase
      .channel(`radar-${p.specUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          if (updated.status === "accepted") {
            setLiveJobs((prev) => prev.filter((j) => j.dbId !== updated.id));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [p.specUserId, p.specialist.niche]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PHASE 4: MOCK FALLBACK JOBS ──────────────────────────────────────────
  // Shown only when there are no live DB jobs so the radar never looks empty.
  const radarOpenMs = useRef(Date.now());
  const nicheJobsMemo = useMemo(
    () => getJobsForNiche(p.specialist.niche).map<RadarEntry>(
      (j) => ({ ...j, addedAtMs: radarOpenMs.current }),
    ),
    [p.specialist.niche],
  );
  const allJobs = useMemo(
    () => liveJobs.length > 0 ? liveJobs : nicheJobsMemo,
    [liveJobs, nicheJobsMemo],
  );

  // ── PHASE 4: CLOCK — drives tier unlocks + `now` for per-job radius ─────
  // radarRadius and isExpired are computed from per-job addedAtMs (same DB source
  // as ClientTracking), so both screens share an identical elapsed-time reference.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    allJobs.forEach((j) => {
      if (j.type === "Instant" && tierDelay > 0 && RADAR_UNLOCK_AT[j.id] == null && Number.isFinite(j.addedAtMs)) {
        RADAR_UNLOCK_AT[j.id] = j.addedAtMs + tierDelay;
      }
    });
    const t = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [tierDelay, allJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Radius is computed per-job from the job's own creation timestamp (addedAtMs),
  // NOT from when the specialist opened the radar. Each job carries its own 3-min window.
  // Guard: if addedAtMs is NaN/0 or in the future, treat as freshly posted (return 3).
  const jobActiveRadius = (j: RadarEntry): number => {
    const elapsed = now - j.addedAtMs;
    if (!Number.isFinite(elapsed) || elapsed < 0) return 3;
    if (elapsed < 60_000)  return 3;
    if (elapsed < 120_000) return 7;
    if (elapsed < 180_000) return 15;
    return 0; // window expired
  };

  // Strict AND: BOTH conditions must be true simultaneously.
  //   1. Tier delay has elapsed  (Platinum 0s / Gold 20s / Silver 40s / Bronze 60s).
  //   2. Job's active radius >= specialist's distance to the job.
  // Example: Silver at 6 km sees nothing at t=40s (radius=3km). Sees it at t=60s (radius=7km).
  const isUnlocked = (j: RadarEntry): boolean => {
    if (j.type !== "Instant") return true;
    const r = jobActiveRadius(j);
    if (r === 0) return false;
    const distKm = parseFloat(j.distance) || 0;
    const tierUnlocked = isPlatinum || (RADAR_UNLOCK_AT[j.id] != null && now >= RADAR_UNLOCK_AT[j.id]);
    return tierUnlocked && distKm <= r;
  };

  const visibleJobs = allJobs.filter(isUnlocked);
  // "Queued" = inside the active radius but tier-locked (not yet this tier's window).
  // Out-of-radius jobs are fully invisible — they don't show in the priority banner.
  const queuedInstant = allJobs.filter((j) => {
    if (j.type !== "Instant" || isUnlocked(j)) return false;
    const r = jobActiveRadius(j);
    if (r === 0) return false;
    const distKm = parseFloat(j.distance) || 0;
    const tierUnlocked = isPlatinum || (RADAR_UNLOCK_AT[j.id] != null && now >= RADAR_UNLOCK_AT[j.id]);
    return !tierUnlocked && distKm <= r;
  });

  // Badge: derived from the oldest active job's DB creation time — same source as ClientTracking.
  // Filter out any NaN/invalid timestamps before Math.min to prevent NaN propagation.
  const validJobMs = allJobs.map((j) => j.addedAtMs).filter((t) => Number.isFinite(t) && t > 0);
  const oldestJobMs = validJobMs.length > 0 ? Math.min(...validJobMs) : now;
  const badgeElapsedMs = now - oldestJobMs;
  const badgeRadius = badgeElapsedMs < 60_000 ? 3 : badgeElapsedMs < 120_000 ? 7 : badgeElapsedMs < 180_000 ? 15 : 0;
  // Only show expired banner when valid jobs exist AND the oldest one truly crossed 180 s.
  // Empty allJobs or jobs with bad timestamps must never trigger the expired state.
  const isExpired = validJobMs.length > 0 && badgeElapsedMs >= 180_000;

  // ── PHASE 4: ATOMIC ACCEPT ───────────────────────────────────────────────
  // Dual guard: ref for synchronous protection (React 18 batching can delay useState
  // updates by one render, allowing a second click through), state for the disabled UI.
  const acceptingRef = useRef(false);
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async (j: RadarEntry) => {
    if (acceptingRef.current) {
      console.warn("[REDDY] handleAccept: already in-flight, ignoring");
      return;
    }

    // Session guard — must have a valid specialist session
    if (!p.specUserId) {
      console.error("[REDDY] handleAccept: specUserId is null — session not established");
      toast.error("Session error", { description: "Your session expired. Please log in again." });
      return;
    }

    if (p.masterStatus !== "active") {
      console.warn("[REDDY] handleAccept: masterStatus =", p.masterStatus, "— blocking accept");
      toast.error("Identity verification required", { description: `Current status: ${p.masterStatus}. Complete KYC to accept jobs.` });
      return;
    }

    if (j.type === "Instant") {
      if (j.dbId) {
        // ── Real DB job — atomic Supabase UPDATE ──────────────────────────
        acceptingRef.current = true;
        setAccepting(true);
        try {
          console.log("[REDDY] dbAcceptJob → jobId:", j.dbId, "specId:", p.specUserId);
          const bookingId = await dbAcceptJob({
            jobDbId:  j.dbId,
            specId:   p.specUserId,
            clientId: j.clientId ?? p.specUserId,
            category: j.category,
          });
          console.log("[REDDY] dbAcceptJob result → bookingId:", bookingId);
          if (!bookingId) return; // dbAcceptJob already showed the relevant error toast
          p.setActiveJob(j);
          p.setJobPhase("assigned");
          p.setAlertsCount(Math.max(0, p.alertsCount - 1));
          p.setActiveBookingId(bookingId);
          setLiveJobs((prev) => prev.filter((r) => r.dbId !== j.dbId));
          toast("⚡ Instant job accepted", {
            description: `${j.category} · ${j.client} — tap "I'm on my way" to start live tracking.`,
          });
        } finally {
          // Guaranteed reset — no throw or early return can leave the button locked
          acceptingRef.current = false;
          setAccepting(false);
        }
      } else {
        // ── Mock job — local state only, no DB write ──────────────────────
        console.log("[REDDY] handleAccept: mock job (no dbId), accepting locally");
        p.setActiveJob(j);
        p.setJobPhase("assigned");
        p.setAlertsCount(Math.max(0, p.alertsCount - 1));
        toast("⚡ Instant job accepted", {
          description: `${j.category} · ${j.client} — tap "I'm on my way" to start live tracking.`,
        });
      }
    } else {
      if (!p.acceptedScheduled.find((x) => x.id === j.id)) {
        p.setAcceptedScheduled([...p.acceptedScheduled, j]);
      }
      p.setAlertsCount(Math.max(0, p.alertsCount - 1));
      toast("📅 Scheduled job added to calendar", {
        description: `${j.category} · ${j.client}. You'll get an "I'm on my way" button at the scheduled time.`,
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <div className="px-5 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-black text-[var(--plum-deep)]">Job Radar</h1>
          <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">Matching your niche: {p.specialist.niche || "Handyman"}</div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] text-[11px] font-black uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" /> {isExpired ? "Expired" : `${badgeRadius} km`}
        </div>
      </div>
      <div className="px-5 mb-3">
        <div className="rounded-xl plum-gradient text-white px-3.5 py-2.5 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[var(--sunshine)]" />
          <div className="text-[12px] font-semibold leading-snug">
            Client pays you directly. REDDY auto-charges a flat <span className="font-black text-[var(--sunshine)]">$15</span> commission per completed job — no payout from us.
          </div>
        </div>
      </div>
      {queuedInstant.length > 0 && (
        <div className="px-5 mb-3">
          <div className="rounded-xl bg-[var(--sunshine)]/15 border border-[var(--sunshine-deep)]/30 px-3.5 py-2.5 flex items-center gap-2">
            <Award className="w-4 h-4 text-[var(--plum-deep)]" />
            <div className="text-[12px] font-semibold text-[var(--plum-deep)] leading-snug flex-1">
              <span className="font-black">Priority Access:</span> {queuedInstant.length} new Instant job{queuedInstant.length > 1 ? "s" : ""} reserved for Platinum first. Unlocks in {Math.max(0, Math.ceil((Math.min(...queuedInstant.map((j) => RADAR_UNLOCK_AT[j.id] || now)) - now) / 1000))}s.
            </div>
          </div>
        </div>
      )}
      {isExpired && (
        <div className="px-5 mb-3">
          <div className="rounded-xl bg-[var(--destructive)]/10 border border-[var(--destructive)]/20 px-3.5 py-2.5 text-[12px] font-semibold text-[var(--destructive)] leading-snug">
            Search window expired (3 min). New jobs will surface automatically.
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-5 space-y-3">
        {visibleJobs.map((j) => (
          <div key={j.id} className="rounded-2xl bg-white border border-[var(--beige-border)] p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                j.type === "Instant" ? "sunshine-gradient text-[var(--plum-deep)]" : "bg-[var(--plum-deep)] text-white"
              }`}>{j.type}</span>
              <div className="flex items-center gap-1 text-[12px] font-bold text-[var(--plum-deep)]/65">
                <Navigation className="w-3.5 h-3.5" /> {j.distance}
              </div>
            </div>
            <div className="mt-3 text-[15px] font-extrabold text-[var(--plum-deep)]">{j.category}</div>
            <div className="text-[13px] font-semibold text-[var(--plum-deep)]/65 mt-0.5">{j.note}</div>
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: j.photos }).map((_, i) => (
                <div key={i} className="w-12 h-12 rounded-lg bg-[var(--cream)] border border-[var(--beige-border)] flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-[var(--plum-deep)]/40" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">Client: {j.client}</div>
              <button
                disabled={accepting}
                onClick={() => { void handleAccept(j); }}
                className="h-10 px-5 rounded-xl plum-gradient text-white font-extrabold text-[13px] disabled:opacity-50 transition-opacity"
              >
                {accepting ? "Accepting…" : "Accept"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <SpecBottomNav active="radar" setScreen={p.setScreen} />
    </div>
  );
}

/* ============================================================
   SPECIALIST — ACTIVE
   ============================================================ */
function SpecActive(p: RouterProps) {
  const job = p.activeJob!;
  const enRoute = p.enRoute;
  const [arrived, setArrived] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [bypassPenalized, setBypassPenalized] = useState(false);
  const bypassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noShowSecondsLeft, setNoShowSecondsLeft] = useState(180);

  // GPS ANTI-BYPASS: once arrived & still online, run a window where the
  // specialist must progress the job in-app. If the timer elapses with no
  // Complete/No-Show action, fire a 10-point Trust Score penalty for
  // attempting to bypass the $15 platform fee with a cash-in-hand job.
  useEffect(() => {
    if (!arrived || !p.specOnline || bypassPenalized) return;
    bypassTimerRef.current = setTimeout(() => {
      p.setTrustScore(Math.max(0, p.trustScore - 10));
      setBypassPenalized(true);
      toast("⚠️ Platform-bypass penalty · −10 Trust", {
        description: "GPS shows you've been at the client's address without progressing the job in-app. Complete it inside REDDY to avoid penalties.",
        duration: 7000,
      });
    }, 60_000); // demo: 60s simulates "extended on-site time without progress"
    return () => { if (bypassTimerRef.current) clearTimeout(bypassTimerRef.current); };
  }, [arrived, p.specOnline, bypassPenalized]);

  // 3-minute mandatory wait window: resets when modal closes, counts down when open
  useEffect(() => {
    if (!confirmNoShow) { setNoShowSecondsLeft(180); return; }
    const t = setInterval(() => setNoShowSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [confirmNoShow]);

  const handleNoShow = () => {
    if (!arrived) {
      toast("📍 Locked", { description: "Mark yourself as Arrived first — GPS must confirm you're at the address." });
      return;
    }
    if (noShowSecondsLeft > 0) {
      toast("⏳ Mandatory window active", {
        description: `Client has ${Math.floor(noShowSecondsLeft / 60)}:${String(noShowSecondsLeft % 60).padStart(2, "0")} to respond before you can confirm no-show.`,
      });
      return;
    }
    setConfirmNoShow(false);
    toast("✅ Client no-show confirmed", {
      description: "GPS verified you were at the address. $0 platform fee · Trust Score protected.",
      duration: 6000,
    });
    dbSyncPhase(p.activeBookingId, 'idle'); // marks booking as 'cancelled' in DB
    p.setJobPhase('idle');
    p.setActiveBookingId(null);
    p.setEnRoute(false);
    p.setActiveJob(null);
    p.setScreen("spec-radar");
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Active job" onBack={() => p.setScreen("spec-radar")} />

      <div className="relative h-[300px] bg-[var(--cream)] mx-5 rounded-3xl overflow-hidden border border-[var(--beige-border)]">
        {enRoute ? (
          <>
            <MockMap />
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur shadow-soft text-[12px] font-extrabold text-[var(--plum-deep)] flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" /> {arrived ? "Arrived · GPS confirmed" : "Live · routing to client"}
            </div>
            <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-[var(--plum-deep)] text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--sunshine)] animate-pulse" /> Sharing location
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-full sunshine-gradient flex items-center justify-center shadow-glow">
              <Clock className="w-7 h-7 text-[var(--plum-deep)]" />
            </div>
            <div className="mt-3 text-[14px] font-extrabold text-[var(--plum-deep)]">Job accepted</div>
            <div className="mt-1 text-[12px] font-semibold text-[var(--plum-deep)]/65 max-w-[260px]">
              Tap <span className="font-black">I'm on my way</span> below to start live tracking with the client.
            </div>
          </div>
        )}
      </div>

      <div className="px-5 mt-4">
        <div className="rounded-2xl bg-white border border-[var(--beige-border)] p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl sunshine-gradient flex items-center justify-center text-[18px] font-black text-[var(--plum-deep)]">
            {job.client[0]}
          </div>
          <div className="flex-1">
            <div className="font-extrabold text-[var(--plum-deep)]">{job.client}</div>
            <div className="text-[12px] font-bold text-[var(--plum-deep)]/60">{job.category} · {job.distance}</div>
          </div>
          <button onClick={() => p.setScreen("spec-chat")} className="w-11 h-11 rounded-xl plum-gradient text-white flex items-center justify-center active:scale-95">
            <MessageCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] p-4">
          <div className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">Job notes</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--plum-deep)]/80">{job.note}</div>
        </div>

        <div className="mt-3 rounded-2xl bg-white border border-[var(--beige-border)] p-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--cream)] flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-[var(--plum-deep)]" />
          </div>
          <div className="text-[12px] font-semibold text-[var(--plum-deep)]/70 leading-snug">
            REDDY commission: <span className="font-black text-[var(--plum-deep)]">flat $15</span> per completed job. Everything else you collect is yours. In-app chat only — no phone numbers shared.
          </div>
        </div>
      </div>

      <div className="mt-auto px-5 pb-8 space-y-2">
        {!enRoute ? (
          <PrimaryBtn variant="plum" onClick={() => {
            p.setEnRoute(true);
            p.setJobPhase('en_route');
            dbSyncPhase(p.activeBookingId, 'en_route');
          }}>
            <Navigation className="inline w-4 h-4 mr-2" /> I'm on my way
          </PrimaryBtn>
        ) : !arrived ? (
          <>
            <PrimaryBtn variant="plum" onClick={() => {
              setArrived(true);
              p.setJobPhase('arrived');
              dbSyncPhase(p.activeBookingId, 'arrived');
            }}>
              <MapPin className="inline w-4 h-4 mr-2" /> I've Arrived
            </PrimaryBtn>
            <button
              disabled
              className="w-full h-12 rounded-xl bg-[var(--cream)] text-[var(--plum-deep)]/40 font-extrabold text-[13px] flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <AlertTriangle className="w-4 h-4" /> Client No-Show · locked until Arrived
            </button>
          </>
        ) : (
          <>
            <PrimaryBtn variant="sunshine" onClick={() => {
              p.setJobPhase('working');
              p.setScreen("spec-complete");
              dbSyncPhase(p.activeBookingId, 'working');
            }}>
              Complete Job
            </PrimaryBtn>
            <button
              onClick={() => setConfirmNoShow(true)}
              className="w-full h-12 rounded-xl bg-white border-2 border-[var(--destructive)]/40 text-[var(--destructive)] font-extrabold text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              <AlertTriangle className="w-4 h-4" /> Client No-Show
            </button>
          </>
        )}
      </div>

      {confirmNoShow && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-end" onClick={() => setConfirmNoShow(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-[var(--beige-border)] mx-auto mb-4" />
            <div className="text-[18px] font-black text-[var(--plum-deep)]">Confirm Client No-Show?</div>
            <div className="mt-2 text-[13px] font-semibold text-[var(--plum-deep)]/70 leading-snug">
              GPS confirms you're at the address. Filing a no-show waives the $15 platform fee and protects your Trust Score. False reports trigger a heavy penalty.
            </div>
            {noShowSecondsLeft > 0 ? (
              <div className="mt-3 rounded-xl bg-[var(--sunshine)]/15 border border-[var(--sunshine-deep)]/30 p-3 text-center">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">Client response window</div>
                <div className="mt-1 text-[22px] font-black text-[var(--plum-deep)]">
                  {Math.floor(noShowSecondsLeft / 60)}:{String(noShowSecondsLeft % 60).padStart(2, "0")}
                </div>
                <div className="text-[10px] font-semibold text-[var(--plum-deep)]/50">Button unlocks when timer expires</div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/30 p-2 text-center text-[12px] font-black text-[var(--success)]">
                ✓ Window expired — you may confirm
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmNoShow(false)} className="h-12 rounded-xl bg-[var(--cream)] text-[var(--plum-deep)] font-extrabold text-[13px]">Keep waiting</button>
              <button onClick={handleNoShow} className="h-12 rounded-xl bg-[var(--destructive)] text-white font-extrabold text-[13px]">Confirm no-show</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SPECIALIST — COMPLETE (post-job evaluation)
   ============================================================ */
function SpecComplete(p: RouterProps) {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<null | { label: string; delta: number; tone: "good" | "warn" | "bad"; copy: string }>(null);

  // Punctuality telemetry: compare scheduled time vs now (only meaningful for Scheduled jobs).
  const category = p.activeJob?.category || p.specialist.niche || "Service";
  const scheduledAt = p.activeJob?.scheduledAt;
  const lateMinutes = scheduledAt ? Math.max(0, Math.round((Date.now() - scheduledAt) / 60000)) : 0;
  const isLate = lateMinutes > 15; // grace window per spec
  const [delayReason, setDelayReason] = useState("");
  const [delayProof, setDelayProof] = useState(false);
  const delayJustified = !isLate || delayProof || delayReason.trim().length >= 8;

  const submit = () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return;
    if (isLate && !delayJustified) return; // gate submission until reason/proof provided

    // 1) Category-based price benchmarking (smart pricing).
    const range = getPriceRange(category);
    const isScheduled = p.activeJob?.type === "Scheduled";
    let res: { label: string; delta: number; tone: "good" | "warn" | "bad"; copy: string };
    let overpriced = false;
    if (n < range.min * 0.6) {
      res = { label: "Too Cheap", delta: -1, tone: "warn", copy: `Below the ${category} fair-market floor ($${range.min}). Price your skill confidently.` };
    } else if (n > range.max * 1.25) {
      overpriced = true;
      res = { label: "Above Market", delta: -3, tone: "bad", copy: `${category} usually runs $${range.min}-$${range.max}. If the client rates this 5★ we'll override the penalty.` };
    } else if (isScheduled) {
      res = { label: "Custom Market Rate", delta: +2, tone: "good", copy: "Scheduled work auto-approved at the pre-negotiated rate." };
    } else {
      res = { label: "Fair Market Price", delta: +2, tone: "good", copy: `Right in the ${category} fair-market band ($${range.min}-$${range.max}). Trust Score grows.` };
    }

    // 2) Punctuality validation — penalize only if late AND no valid proof/reason.
    if (isLate && !delayJustified) {
      res = { ...res, delta: res.delta - 2, tone: "bad", label: `${res.label} · Late`, copy: `${res.copy} Arrived ${lateMinutes} min late without proof.` };
    } else if (isLate && delayJustified) {
      res = { ...res, copy: `${res.copy} Late arrival (${lateMinutes} min) — safeguarded by your proof/reason.` };
    }

    setResult(res);
    p.setLastEval({ tone: res.tone, overpriced, category, amount: n });
    p.setTrustScore(Math.max(0, Math.min(100, p.trustScore + res.delta)));
    p.setCompletedJobs(p.completedJobs + 1);
    if (p.activeJob?.type === "Instant") p.setInstantDone(p.instantDone + 1);
    else p.setScheduledDone(p.scheduledDone + 1);
    // Clear the completed job from the scheduled queue so Calendar header & day list update instantly.
    if (p.activeJob) {
      const doneId = p.activeJob.id;
      p.setAcceptedScheduled(p.acceptedScheduled.filter((j) => j.id !== doneId));
    }
    // REDDY takes a flat $15 commission per completed job — handyman keeps the rest.
    p.setTotalEarned(p.totalEarned + Math.max(0, n - 15));
    // Store handyman's declared price for the client cross-check overlay.
    p.setHandymanReportedPrice(n);
    // Advance state machine — locks screen on spec-complete until finish() is called.
    p.setJobPhase('completed');
    // Sync handyman price to DB immediately (client price + discrepancy flag added later).
    dbSavePrices(p.activeBookingId, n, null, false);
  };

  const finish = () => {
    p.setJobPhase('idle');        // release routing lock → spec-dashboard is reachable again
    p.setActiveJob(null);
    p.setEnRoute(false);
    // clientJobCount increment happens inside ClientPriceConfirmModal AFTER the client
    // confirms or skips — ensures loyalty count only rises on fully completed bookings.
    p.setClientPricePrompt(true); // trigger the global price cross-check overlay
    p.setScreen("spec-dashboard");
  };

  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Job complete" />
      <div className="flex-1 px-5 py-3">
        {!result ? (
          <>
            <div className="rounded-2xl plum-gradient p-5 text-white">
              <div className="w-12 h-12 rounded-xl sunshine-gradient flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-[var(--plum-deep)]" />
              </div>
              <div className="text-[20px] font-black">Nice work!</div>
              <div className="mt-1 text-[13px] font-semibold text-white/75">
                How much did you charge the client in total?
              </div>
            </div>

            <div className="mt-5">
              <label className="block">
                <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Total amount</span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-black text-[var(--plum-deep)]/40">$</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-16 pl-10 pr-4 rounded-2xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-black text-[28px] focus:outline-none focus:border-[var(--sunshine-deep)]"
                  />
                </div>
              </label>
              <div className="mt-2 text-[12px] font-semibold text-[var(--plum-deep)]/55">
                {category} fair-market range: <span className="font-black text-[var(--plum-deep)]/80">${getPriceRange(category).min}–${getPriceRange(category).max}</span>
              </div>
            </div>

            {isLate && (
              <div className="mt-4 rounded-2xl border border-[var(--sunshine-deep)]/40 bg-[var(--sunshine)]/15 p-4 slide-up">
                <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-[var(--plum-deep)]">
                  <AlertTriangle className="w-4 h-4 text-[var(--sunshine-deep)]" />
                  Arrived {lateMinutes} min late
                </div>
                <div className="mt-1 text-[12px] font-semibold text-[var(--plum-deep)]/70">
                  Upload proof or share the reason — we'll safeguard your Trust Score.
                </div>
                <textarea
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  placeholder="e.g. heavy traffic on I-95, client asked to push the slot, emergency reroute…"
                  className="mt-3 w-full min-h-[68px] rounded-xl bg-white border border-[var(--beige-border)] px-3 py-2 text-[13px] font-semibold text-[var(--plum-deep)] focus:outline-none focus:border-[var(--sunshine-deep)]"
                />
                <button
                  onClick={() => setDelayProof((v) => !v)}
                  className={`mt-2 w-full h-10 rounded-xl text-[12px] font-black uppercase tracking-wider transition ${
                    delayProof ? "bg-[var(--success)] text-white" : "bg-white border border-[var(--beige-border)] text-[var(--plum-deep)]"
                  }`}
                >
                  {delayProof ? "✓ Proof attached" : "Upload proof photo"}
                </button>
              </div>
            )}

            <div className="mt-6">
              <PrimaryBtn variant="plum" disabled={!amount || (isLate && !delayJustified)} onClick={submit}>Submit & evaluate</PrimaryBtn>
              {isLate && !delayJustified && (
                <div className="mt-2 text-center text-[11px] font-bold text-[var(--destructive)]">
                  Add a reason (≥8 chars) or attach proof to continue.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center pt-8 slide-up">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
              result.tone === "good" ? "bg-[var(--success)]/20" : result.tone === "warn" ? "bg-[var(--sunshine)]/30" : "bg-[var(--destructive)]/15"
            }`}>
              {result.tone === "good" ? <CheckCircle2 className="w-10 h-10 text-[var(--success)]" /> :
                result.tone === "warn" ? <AlertTriangle className="w-10 h-10 text-[var(--sunshine-deep)]" /> :
                <X className="w-10 h-10 text-[var(--destructive)]" />}
            </div>
            <div className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--plum-deep)]/55">Evaluation</div>
            <div className="mt-1 text-[26px] font-black text-[var(--plum-deep)]">{result.label}</div>
            <div className={`mt-2 px-3 py-1.5 rounded-full text-[12px] font-black uppercase tracking-wider ${
              result.delta >= 0 ? "bg-[var(--success)] text-white" : "bg-[var(--destructive)] text-white"
            }`}>
              Trust Score {result.delta >= 0 ? "+" : ""}{result.delta}
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[var(--plum-deep)]/65 max-w-[300px]">
              {result.copy}
            </p>
            <div className="mt-8 w-full">
              <PrimaryBtn variant="sunshine" onClick={finish}>Back to dashboard</PrimaryBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALIST — PROFILE
   ============================================================ */
function SpecProfileScreen(p: RouterProps) {
  const [kycLoading, setKycLoading] = useState(false);

  const handleTriggerKyc = async () => {
    if (!p.specUserId) {
      toast("Session not found", { description: "Please sign out and sign back in to complete verification." });
      return;
    }
    setKycLoading(true);
    const { error } = await supabase.from("profiles")
      .update({ verification_status: "pending" })
      .eq("id", p.specUserId);
    if (error) {
      toast.error("Submission failed", { description: error.message });
      setKycLoading(false);
      return;
    }
    p.setVerificationStatus("pending");
    setKycLoading(false);
    toast("🔍 Reviewing document…", { description: "Mock KYC is processing your ID. Result in 5 seconds." });
    setTimeout(async () => {
      await supabase.from("profiles")
        .update({ verification_status: "id_verified", master_status: "active" })
        .eq("id", p.specUserId!);
      p.setVerificationStatus("id_verified");
      p.setMasterStatus("active");
      toast.success("✅ Identity verified!", { description: "Your account is now active. Go online to start accepting jobs." });
    }, 5000);
  };

  const items = [
    { label: "Personal details", icon: User, to: "spec-profile-personal" as Screen },
    { label: "Niche & References", icon: FileText, to: "spec-profile-niche" as Screen },
    { label: "Billing & Commission", icon: CreditCard, to: "spec-profile-payout" as Screen },
    { label: "Help Center", icon: LifeBuoy, to: "spec-profile-help" as Screen },
  ];
  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <TopBar title="Profile" />
      <div className="px-5">
        <div className="rounded-2xl plum-gradient p-5 text-white flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl sunshine-gradient flex items-center justify-center text-[26px] font-black text-[var(--plum-deep)]">
            {(p.specialist.name || "A")[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-black">{p.specialist.name || "Alex Morgan"}</div>
            <div className="text-[12px] font-bold text-white/70">{p.specialist.niche} Specialist</div>
            <div className="mt-1 flex items-center gap-1 text-[12px] font-bold text-[var(--sunshine)]">
              <Star className="w-3.5 h-3.5 fill-[var(--sunshine)]" /> 4.9 · {p.completedJobs} jobs
            </div>
          </div>
        </div>
      </div>

      {/* KYC Verification Card */}
      <div className="px-5 mt-3">
        {p.verificationStatus === "id_verified" ? (
          <div className="rounded-2xl bg-[var(--success)]/10 border border-[var(--success)]/30 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--success)]/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-[var(--success)]" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-extrabold text-[var(--success)]">Identity Verified</div>
              <div className="text-[11px] font-bold text-[var(--plum-deep)]/55 mt-0.5">Account active · Ready to accept jobs</div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0" />
          </div>
        ) : p.verificationStatus === "pending" ? (
          <div className="rounded-2xl bg-[var(--sunshine)]/15 border border-[var(--sunshine-deep)]/30 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl sunshine-gradient flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-[var(--plum-deep)] animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-extrabold text-[var(--plum-deep)]">Verification in Progress…</div>
              <div className="text-[11px] font-bold text-[var(--plum-deep)]/55 mt-0.5">AI is reviewing your document. Usually under 1 minute.</div>
            </div>
          </div>
        ) : p.verificationStatus === "rejected" ? (
          <div className="rounded-2xl bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--destructive)]/15 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-[var(--destructive)]" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-extrabold text-[var(--destructive)]">Verification Rejected</div>
              <div className="text-[11px] font-bold text-[var(--plum-deep)]/55 mt-0.5">Please contact support to resolve this issue.</div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleTriggerKyc}
            disabled={kycLoading}
            className="w-full rounded-2xl border-2 border-[var(--sunshine-deep)] bg-[var(--sunshine)]/10 p-4 flex items-center gap-3 active:scale-[0.99] transition disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-xl sunshine-gradient flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-[var(--plum-deep)]" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[14px] font-extrabold text-[var(--plum-deep)]">
                {kycLoading ? "Submitting document…" : "Verify Your Identity"}
              </div>
              <div className="text-[11px] font-bold text-[var(--plum-deep)]/55 mt-0.5">Required to accept jobs · Takes ~5 seconds</div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--plum-deep)]/40 flex-shrink-0" />
          </button>
        )}
      </div>

      <div className="px-5 mt-4 space-y-2">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <button key={it.label} onClick={() => p.setScreen(it.to)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-[var(--beige-border)]">
              <div className="w-10 h-10 rounded-xl bg-[var(--cream)] flex items-center justify-center">
                <Icon className="w-5 h-5 text-[var(--plum-deep)]" />
              </div>
              <span className="flex-1 text-left font-extrabold text-[var(--plum-deep)]">{it.label}</span>
              <ChevronRight className="w-5 h-5 text-[var(--plum-deep)]/40" />
            </button>
          );
        })}
        <button
          onClick={() => { p.setRole(null); p.setScreen("gateway"); }}
          className="w-full mt-3 py-3 text-[13px] font-extrabold text-[var(--destructive)]"
        >
          Sign out
        </button>
      </div>
      <SpecBottomNav active="profile" setScreen={p.setScreen} />
    </div>
  );
}

/* ============================================================
   NOTIFICATIONS BELL — functional dropdown
   ============================================================ */
function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([
    { id: 1, icon: CheckCircle2, tone: "good", title: "Specialist matched", body: "Marcus B. accepted your job and is en route.", time: "2m" },
    { id: 2, icon: Star, tone: "warn", title: "Rate your last job", body: "Tap to leave feedback for Sofia A.", time: "1h" },
    { id: 3, icon: ShieldCheck, tone: "good", title: "Payment receipt", body: "$5.00 booking fee — Job #A-2287.", time: "3h" },
    { id: 4, icon: Bell, tone: "neutral", title: "New service available", body: "HVAC specialists now in your area.", time: "1d" },
  ]);
  const unread = items.length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-11 h-11 rounded-full bg-[var(--cream)] flex items-center justify-center active:scale-95 transition"
      >
        <Bell className="w-5 h-5 text-[var(--plum-deep)]" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--destructive)] text-white text-[9px] font-black flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-40 w-[300px] bg-white rounded-2xl shadow-2xl border border-[var(--beige-border)] overflow-hidden drop-down">
            <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--beige-border)] sunshine-gradient">
              <div className="font-black text-[14px] text-[var(--plum-deep)]">Notifications</div>
              <button onClick={() => setItems([])} className="text-[11px] font-extrabold text-[var(--plum-deep)]/70 underline">Clear all</button>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-6 text-center text-[12px] font-semibold text-[var(--plum-deep)]/50">You're all caught up ✨</div>
              ) : items.map((n) => {
                const Icon = n.icon;
                return (
                  <div key={n.id} className="px-4 py-3 flex items-start gap-3 border-b border-[var(--beige-border)] last:border-0 hover:bg-[var(--cream)] transition">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      n.tone === "good" ? "bg-[var(--success)]/15 text-[var(--success)]"
                      : n.tone === "warn" ? "bg-[var(--sunshine)]/30 text-[var(--sunshine-deep)]"
                      : "bg-[var(--cream)] text-[var(--plum-deep)]"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-extrabold text-[var(--plum-deep)] truncate">{n.title}</div>
                        <div className="text-[10px] font-bold text-[var(--plum-deep)]/45 flex-shrink-0">{n.time}</div>
                      </div>
                      <div className="text-[12px] font-semibold text-[var(--plum-deep)]/65 leading-snug">{n.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   SPECIALIST — NICHE & REFERENCES
   ============================================================ */
function SpecNicheScreen(p: RouterProps) {
  const [refs, setRefs] = useState<{ id: number; name: string }[]>([
    { id: 1, name: "License_2024.pdf" },
    { id: 2, name: "Project_portfolio.pdf" },
  ]);
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Niche & References" onBack={() => p.setScreen("spec-profile")} />
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
        <div>
          <span className="block text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider mb-1.5">Primary Category</span>
          <div className="relative">
            <select
              value={p.specialist.niche}
              onChange={(e) => p.setSpecialist({ ...p.specialist, niche: e.target.value })}
              className="w-full h-12 px-4 pr-10 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] text-[var(--plum-deep)] font-semibold appearance-none focus:outline-none focus:border-[var(--sunshine-deep)]"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--plum-deep)]/50 pointer-events-none" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider">Sub-skills</span>
            <span className="text-[10px] font-extrabold text-[var(--plum-deep)]/45">{p.specialist.subSkills.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Emergency Repair", "Installation", "Diagnostics", "Maintenance", "Inspection", "Renovation", "Leak Detection", "Smart Home"].map((s) => {
              const on = p.specialist.subSkills.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => p.setSpecialist({
                    ...p.specialist,
                    subSkills: on ? p.specialist.subSkills.filter((x) => x !== s) : [...p.specialist.subSkills, s],
                  })}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-extrabold border-2 transition active:scale-95 ${
                    on ? "sunshine-gradient text-[var(--plum-deep)] border-transparent" : "bg-white border-[var(--beige-border)] text-[var(--plum-deep)]/70"
                  }`}
                >{on ? "✓ " : "+ "}{s}</button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-[var(--plum-deep)]/55">Tap to add or remove. Used by Job Radar to match relevant jobs.</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-bold text-[var(--plum-deep)]/70 uppercase tracking-wider">References & Credentials</span>
            <span className="text-[10px] font-black text-[var(--success)] uppercase tracking-wider">Verified</span>
          </div>
          <div className="space-y-2">
            {refs.map((r) => (
              <div key={r.id} className="rounded-xl bg-[var(--cream)] border border-[var(--beige-border)] p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[var(--plum-deep)]" />
                </div>
                <div className="flex-1 text-[13px] font-extrabold text-[var(--plum-deep)] truncate">{r.name}</div>
                <button onClick={() => setRefs(refs.filter((x) => x.id !== r.id))} className="p-2 text-[var(--plum-deep)]/40">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setRefs([...refs, { id: Date.now(), name: `Document_${refs.length + 1}.pdf` }])}
              className="w-full h-14 rounded-xl border-2 border-dashed border-[var(--beige-border)] flex items-center justify-center gap-2 font-extrabold text-[var(--plum-deep)]/60"
            >
              <Upload className="w-4 h-4" /> Upload reference
            </button>
          </div>
        </div>
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="plum" onClick={() => p.setScreen("spec-profile")}>Save changes</PrimaryBtn>
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALIST — PAYOUT METHODS
   ============================================================ */
function SpecPayoutScreen(p: RouterProps) {
  const [tab, setTab] = useState<"card" | "bank">("card");
  const [card, setCard] = useState({ num: "", exp: "", cvc: "", holder: "" });
  const [bank, setBank] = useState({ holder: "", iban: "", swift: "" });
  const [linked, setLinked] = useState(false);
  const valid = tab === "card" ? card.num && card.exp && card.cvc && card.holder : bank.holder && bank.iban;
  return (
    <div className="flex flex-col h-full bg-white slide-up">
      <TopBar title="Billing & Commission" onBack={() => p.setScreen("spec-profile")} />
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
        <div className="rounded-2xl plum-gradient p-4 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--sunshine)]" />
            <div className="text-[12px] font-black uppercase tracking-wider text-[var(--sunshine)]">How billing works</div>
          </div>
          <div className="mt-2 text-[13px] font-semibold text-white/85 leading-snug">
            To accept jobs, please link your credit card or bank account. <span className="font-black text-[var(--sunshine)]">REDDY does not pay you</span> — clients pay you directly. REDDY automatically charges a flat <span className="font-black text-[var(--sunshine)]">$15 commission</span> only when a job is successfully completed.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--cream)] border border-[var(--beige-border)]">
          <button
            onClick={() => setTab("card")}
            className={`h-10 rounded-lg font-extrabold text-[13px] transition ${tab === "card" ? "bg-white shadow-soft text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/55"}`}
          >
            <CreditCard className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Credit Card
          </button>
          <button
            onClick={() => setTab("bank")}
            className={`h-10 rounded-lg font-extrabold text-[13px] transition ${tab === "bank" ? "bg-white shadow-soft text-[var(--plum-deep)]" : "text-[var(--plum-deep)]/55"}`}
          >
            <Briefcase className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Bank Account
          </button>
        </div>

        {tab === "card" ? (
          <div className="space-y-3 chat-pop">
            <div className="rounded-2xl plum-gradient p-5 text-white relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-[var(--sunshine)]/15" />
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">REDDY · Billing Card</div>
              <div className="mt-6 text-[18px] font-black tracking-[0.2em]">{card.num || "•••• •••• •••• ••••"}</div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase text-white/60">Holder</div>
                  <div className="text-[11px] font-extrabold">{card.holder || "FULL NAME"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase text-white/60">Exp</div>
                  <div className="text-[11px] font-extrabold">{card.exp || "MM/YY"}</div>
                </div>
              </div>
            </div>
            <Field label="Cardholder name" value={card.holder} onChange={(v) => setCard({ ...card, holder: v })} placeholder="Alex Morgan" />
            <Field label="Card number" value={card.num} onChange={(v) => setCard({ ...card, num: v })} placeholder="1234 5678 9012 3456" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Expiry" value={card.exp} onChange={(v) => setCard({ ...card, exp: v })} placeholder="MM / YY" />
              <Field label="CVC" value={card.cvc} onChange={(v) => setCard({ ...card, cvc: v })} placeholder="123" />
            </div>
          </div>
        ) : (
          <div className="space-y-3 chat-pop">
            <Field label="Account holder" value={bank.holder} onChange={(v) => setBank({ ...bank, holder: v })} placeholder="Alex Morgan" />
            <Field label="IBAN / Account number" value={bank.iban} onChange={(v) => setBank({ ...bank, iban: v })} placeholder="DE89 3704 0044 0532 0130 00" />
            <Field label="SWIFT / Routing (optional)" value={bank.swift} onChange={(v) => setBank({ ...bank, swift: v })} placeholder="COBADEFFXXX" />
          </div>
        )}

        {linked && (
          <div className="rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/40 p-3 flex items-center gap-2 chat-pop">
            <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
            <span className="text-[12px] font-extrabold text-[var(--success)]">Billing method linked. REDDY will auto-charge $15 per completed job.</span>
          </div>
        )}
      </div>
      <div className="px-5 pb-8 pt-2 border-t border-[var(--beige-border)]">
        <PrimaryBtn variant="sunshine" disabled={!valid} onClick={() => setLinked(true)}>
          {linked ? "Update billing method" : "Link billing method"}
        </PrimaryBtn>
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALIST — ALERT BUTTON (distinct from client bell)
   ============================================================ */
function SpecAlertButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      className="relative h-10 px-3 rounded-xl plum-gradient text-white flex items-center gap-1.5 active:scale-95 transition shadow-soft"
    >
      <AlertTriangle className="w-4 h-4 text-[var(--sunshine)]" />
      <span className="text-[10px] font-black uppercase tracking-wider">Alerts</span>
      {count > 0 && (
        <span key={count} className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-md bg-[var(--sunshine)] text-[var(--plum-deep)] text-[10px] font-black flex items-center justify-center chat-pop">{count}</span>
      )}
    </button>
  );
}

/* ============================================================
   SPECIALIST — ALERTS SCREEN (distinct from client bell dropdown)
   ============================================================ */
function SpecAlertsScreen(p: RouterProps) {
  useEffect(() => { p.setAlertsCount(0); }, []);
  const niche = p.specialist.niche || "your trade";
  const isFresh = p.completedJobs === 0 && p.totalEarned === 0;
  type Alert = { id: number; tone: "urgent" | "info" | "good"; icon: any; title: string; body: string; time: string; action?: string; screen?: Screen };
  const alerts: Alert[] = [];

  if (isFresh) {
    alerts.push({
      id: 1, tone: "good", icon: Sparkles,
      title: "Welcome to REDDY!",
      body: `We're scanning your area for live ${niche} jobs. You'll be alerted the moment one drops.`,
      time: "now", action: "Open Radar", screen: "spec-radar" as Screen,
    });
  } else {
    alerts.push({
      id: 1, tone: "urgent", icon: Zap,
      title: "New Instant job in your area",
      body: `${niche} · 1.2km · tap Radar to accept.`,
      time: "now", action: "Open Radar", screen: "spec-radar" as Screen,
    });
    if (p.acceptedScheduled.length > 0) {
      const next = p.acceptedScheduled[0];
      alerts.push({
        id: 2, tone: "info", icon: Calendar,
        title: "Scheduled job reminder",
        body: `${next.category} — ${next.client}. Tap "I'm on my way" when you start.`,
        time: "1h",
      });
    }
    if (p.completedJobs > 0) {
      const net = Math.max(0, (p.lastEval?.amount || 0) - 15);
      const jobNo = `A-${2200 + p.completedJobs}`;
      alerts.push({
        id: 3, tone: "good", icon: TrendingUp,
        title: "Trust Score up +2",
        body: `Fair-market pricing on your last ${p.lastEval?.category || niche} job. Keep it up!`,
        time: "just now",
      });
      alerts.push({
        id: 4, tone: "info", icon: CreditCard,
        title: "Earnings Updated",
        body: `You made $${net.toFixed(2)} on Job #${jobNo} — client paid you directly (flat $15 platform fee applied).`,
        time: "just now",
      });
    }
  }
  return (
    <div className="flex flex-col h-full bg-[var(--cream)]/40 pb-24 slide-up">
      <TopBar title="Specialist Alerts" onBack={() => p.setScreen("spec-dashboard")} />

      {/* Editorial hero */}
      <div className="px-5 pt-1 pb-4">
        <div className="rounded-3xl plum-gradient p-5 text-white relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-[var(--sunshine)]/20 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--sunshine)] animate-pulse" />
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--sunshine)]">Live Ops Feed</div>
            </div>
            <div className="mt-2 text-[22px] font-black leading-tight tracking-tight">Your priority signals</div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-white/70 max-w-[280px] leading-relaxed">
              Curated for active specialists — every alert is action-first, sorted by urgency.
            </div>
            <div className="mt-3 flex items-center gap-4 text-[11px] font-black uppercase tracking-wider text-white/85">
              <span>{alerts.filter(a => a.tone === "urgent").length} urgent</span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>{alerts.length} total today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section label */}
      <div className="px-5 mb-2 flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--plum-deep)]/55">Today</div>
        <div className="text-[10px] font-bold text-[var(--plum-deep)]/40">Auto-refresh</div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 space-y-3">
        {alerts.map((a) => {
          const Icon = a.icon;
          const isUrgent = a.tone === "urgent";
          const isGood = a.tone === "good";
          const accent = isUrgent ? "var(--sunshine-deep)" : isGood ? "var(--success)" : "var(--plum-deep)";
          return (
            <div
              key={a.id}
              className="relative rounded-3xl bg-white border border-[var(--beige-border)] p-4 pl-5 shadow-[0_2px_14px_-8px_rgba(60,30,80,0.18)]"
            >
              {/* left accent rail */}
              <span
                className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
                style={{ background: `var(--${isUrgent ? "sunshine-deep" : isGood ? "success" : "plum-deep"})` }}
              />
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    isUrgent ? "sunshine-gradient text-[var(--plum-deep)]"
                    : isGood ? "bg-[var(--success)]/12 text-[var(--success)]"
                    : "bg-[var(--cream)] text-[var(--plum-deep)]"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isUrgent && (
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--sunshine-deep)] bg-[var(--sunshine)]/25 px-1.5 py-0.5 rounded">
                        Urgent
                      </span>
                    )}
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--plum-deep)]/45 ml-auto">{a.time}</div>
                  </div>
                  <div className="mt-1 text-[15px] font-black text-[var(--plum-deep)] leading-tight tracking-tight">{a.title}</div>
                  <div className="mt-1 text-[12.5px] font-semibold text-[var(--plum-deep)]/65 leading-relaxed">{a.body}</div>
                  {a.action && (
                    <button
                      onClick={() => a.screen && p.setScreen(a.screen)}
                      className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full plum-gradient text-white text-[11px] font-black uppercase tracking-wider active:scale-95 transition"
                      style={{ color: accent === "var(--sunshine-deep)" ? undefined : undefined }}
                    >
                      {a.action} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div className="pt-2 pb-1 text-center text-[11px] font-bold text-[var(--plum-deep)]/35">
          You're all caught up ·  Elite Service
        </div>
      </div>
      <SpecBottomNav active="dashboard" setScreen={p.setScreen} />
    </div>
  );
}

/* ============================================================
   SPECIALIST — CALENDAR (accepted scheduled jobs)
   ============================================================ */
function SpecCalendar(p: RouterProps) {
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const startOfWeek = useMemo(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d;
  }), [startOfWeek]);

  const goWeek = (delta: 1 | -1) => {
    setDir(delta);
    setWeekOffset((w) => w + delta);
  };

  // Touch swipe handling
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current; if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    touchRef.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goWeek(dx < 0 ? 1 : -1);
    }
  };

  const seeded = useMemo(() => {
    if (p.acceptedScheduled.length > 0) return p.acceptedScheduled;
    return [];
  }, [p.acceptedScheduled]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, { job: JobRequest; at: Date }[]>();
    seeded.forEach((j, idx) => {
      const at = new Date(); at.setHours(10 + idx, 0, 0, 0); at.setDate(at.getDate() + (idx + 1));
      const key = at.toDateString();
      const arr = map.get(key) ?? [];
      arr.push({ job: j, at });
      map.set(key, arr);
    });
    return map;
  }, [seeded]);

  const [selectedKey, setSelectedKey] = useState<string>(today.toDateString());
  const selectedJobs = jobsByDay.get(selectedKey) ?? [];

  const startTracking = (job: JobRequest) => {
    p.setActiveJob(job);
    p.setEnRoute(true);
    p.setScreen("spec-active");
    toast("🚐 On my way · Heading to client", { description: `Live tracking started. The client has been notified.` });
  };

  return (
    <div className="flex flex-col h-full bg-white pb-24 slide-up">
      <div className="px-5 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-black text-[var(--plum-deep)]">Calendar</h1>
          <div className="text-[12px] font-bold text-[var(--plum-deep)]/55">{p.acceptedScheduled.length} accepted scheduled jobs</div>
        </div>
        <SpecAlertButton count={p.alertsCount} onClick={() => p.setScreen("spec-alerts")} />
      </div>

      <div className="px-5 mb-2 flex items-center justify-between">
        <button onClick={() => goWeek(-1)} className="w-9 h-9 rounded-lg bg-[var(--cream)] flex items-center justify-center active:scale-95 transition"><ArrowLeft className="w-4 h-4 text-[var(--plum-deep)]" /></button>
        <div className="text-[13px] font-black text-[var(--plum-deep)]">{startOfWeek.toLocaleDateString("en", { month: "long", year: "numeric" })}</div>
        <button onClick={() => goWeek(1)} className="w-9 h-9 rounded-lg bg-[var(--cream)] flex items-center justify-center active:scale-95 transition"><ArrowRight className="w-4 h-4 text-[var(--plum-deep)]" /></button>
      </div>

      <div
        className="px-5 overflow-hidden touch-pan-y select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={weekOffset} className={dir === 1 ? "week-in-right" : "week-in-left"}>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const key = d.toDateString();
              const has = jobsByDay.has(key);
              const isToday = key === today.toDateString();
              const on = selectedKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`relative flex flex-col items-center justify-center py-2 rounded-xl border-2 transition ${
                    on ? "plum-gradient text-white border-transparent" : isToday ? "bg-[var(--cream)] border-[var(--sunshine-deep)] text-[var(--plum-deep)]" : "bg-white border-[var(--beige-border)] text-[var(--plum-deep)]"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase opacity-70">{d.toLocaleDateString("en", { weekday: "short" })[0]}</span>
                  <span className="text-[15px] font-black">{d.getDate()}</span>
                  {has && <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${on ? "bg-[var(--sunshine)]" : "bg-[var(--sunshine-deep)]"}`} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 mt-4 space-y-2.5">
        <div className="text-[11px] font-black uppercase tracking-wider text-[var(--plum-deep)]/55">{new Date(selectedKey).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</div>
        {selectedJobs.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--beige-border)] p-6 text-center">
            <Calendar className="w-8 h-8 mx-auto text-[var(--plum-deep)]/30" />
            <div className="mt-2 text-[13px] font-extrabold text-[var(--plum-deep)]/60">No scheduled jobs today</div>
            <div className="text-[11px] font-semibold text-[var(--plum-deep)]/45 mt-1">Accept a scheduled job from the Radar to see it here.</div>
          </div>
        ) : selectedJobs.map(({ job, at }, i) => {
          const isNow = at.getTime() - Date.now() < 30 * 60 * 1000;
          return (
            <div key={i} className="rounded-2xl bg-white border border-[var(--beige-border)] p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--plum-deep)] text-white">Scheduled</span>
                <span className="text-[12px] font-extrabold text-[var(--plum-deep)]">{at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="mt-2 text-[15px] font-black text-[var(--plum-deep)]">{job.category}</div>
              <div className="text-[12px] font-semibold text-[var(--plum-deep)]/65">{job.client} · {job.distance}</div>
              <div className="text-[12px] font-semibold text-[var(--plum-deep)]/55 mt-1">{job.note}</div>
              <button
                onClick={() => startTracking(job)}
                className={`mt-3 w-full h-11 rounded-xl font-extrabold text-[13px] flex items-center justify-center gap-2 ${
                  isNow ? "sunshine-gradient text-[var(--plum-deep)] shadow-glow" : "plum-gradient text-white"
                }`}
              >
                <Navigation className="w-4 h-4" /> I'm on my way
              </button>
            </div>
          );
        })}
      </div>

      <SpecBottomNav active="calendar" setScreen={p.setScreen} />
    </div>
  );
}
