"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Car,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";

import { API_BASE, apiRequest } from "@/lib/api";

type View =
  | "overview"
  | "drivers"
  | "riders"
  | "waitlist"
  | "rides"
  | "reports"
  | "promos"
  | "payments";
type DriverStatus = "all" | "pending" | "approved" | "rejected";

type AdminSession = {
  admin: { id: string; email: string; role: "admin" };
  accessToken: string;
};

type PageResult<T> = {
  items: T[];
  total: number;
  limit: number;
  skip: number;
};

type WaitlistResult = PageResult<WaitlistEntry> & {
  riders: number;
  drivers: number;
};

type Overview = {
  riders: number;
  drivers: number;
  pendingDrivers: number;
  onlineDrivers: number;
  activeRides: number;
  completedToday: number;
  reportsOpen: number;
  revenueNaira: number;
};

/**
 * Onboarding documents, in the order ops reviews them.
 *
 * Mirrors the checklist the rider app collects (five steps, six uploads —
 * the licence has two sides). Every one the driver can submit is listed, so a
 * missing document shows as an explicit gap rather than not appearing at all.
 */
const DRIVER_DOCUMENTS = [
  {
    key: "licenseUrl",
    required: true,
    label: "Driver's licence — front",
    hint: "Photo, name and licence number must be readable",
  },
  {
    key: "licenseBackUrl",
    required: true,
    label: "Driver's licence — back",
    hint: "Expiry date and any endorsements",
  },
  {
    key: "registrationUrl",
    required: true,
    label: "Vehicle registration",
    hint: "Plate must match the application",
  },
  {
    key: "insuranceUrl",
    required: true,
    label: "Insurance certificate",
    hint: "Must cover commercial use",
  },
  {
    key: "inspectionUrl",
    required: true,
    label: "Vehicle inspection",
    hint: "Roadworthiness within the last 12 months",
  },
  {
    key: "vehiclePhotoUrl",
    required: false,
    label: "Vehicle photo",
    hint: "Clear shot showing the plate",
  },
] as const;

type Driver = {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  plate: string;
  tier: "eco" | "comfort" | "premium";
  approved: boolean;
  applicationStatus: DriverStatus;
  rejectionReason?: string | null;
  /** Onboarding paperwork, null until the driver uploads it. */
  licenseUrl?: string | null;
  licenseBackUrl?: string | null;
  registrationUrl?: string | null;
  insuranceUrl?: string | null;
  inspectionUrl?: string | null;
  vehiclePhotoUrl?: string | null;
  avatarUrl?: string | null;
  online: boolean;
  onTrip: boolean;
  rating: number;
  trips: number;
  earningsNaira: number;
  createdAt: string;
  lastSeenAt: string;
};

type Rider = {
  id: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  tripCount: number;
  isEmailVerified: boolean;
  createdAt: string;
};

type WaitlistEntry = {
  id: string;
  email: string;
  role: "rider" | "driver";
  city: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type RideParty = { id: string; name: string; email?: string; plate?: string };
type Ride = {
  id: string;
  rider: string | RideParty;
  driver: string | RideParty | null;
  pickup: { name: string; address: string };
  dropoff: { name: string; address: string };
  tier: string;
  payment: string;
  status: string;
  fare: { totalNaira: number };
  discountNaira: number;
  tipNaira: number;
  paymentStatus: string;
  reports: { category: string; details?: string | null; createdAt: string }[];
  createdAt: string;
};

type ReportItem = {
  id: string;
  ride: Ride;
  report: { category: string; details?: string | null; createdAt: string };
};

type Promo = {
  id: string;
  code: string;
  description: string;
  kind: "percentage" | "fixed";
  value: number;
  maxDiscountNaira: number | null;
  minFareNaira: number;
  expiresAt: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  perRiderLimit: number;
  active: boolean;
  createdAt: string;
};

type Transaction = {
  id: string;
  reference: string;
  amountKobo: number;
  purpose: string;
  status: string;
  failureReason?: string | null;
  paidAt?: string | null;
  createdAt: string;
  rider?: string | RideParty;
};

const VIEWS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "drivers", label: "Drivers", icon: Car },
  { id: "riders", label: "Riders", icon: Users },
  { id: "waitlist", label: "Waitlist", icon: ClipboardList },
  { id: "rides", label: "Rides", icon: MapPin },
  { id: "reports", label: "Reports", icon: ShieldAlert },
  { id: "promos", label: "Promos", icon: Ticket },
  { id: "payments", label: "Payments", icon: CreditCard },
];

const emptyPage = { items: [], total: 0, limit: 50, skip: 0 };
const emptyWaitlist: WaitlistResult = {
  items: [],
  total: 0,
  limit: 100,
  skip: 0,
  riders: 0,
  drivers: 0,
};

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function personName(value: string | RideParty | null | undefined) {
  if (!value) return "Unassigned";
  if (typeof value === "string") return value.slice(-8);
  return value.name;
}

/** Documents that must be on file before a driver can be approved. */
const REQUIRED_DOCUMENTS = DRIVER_DOCUMENTS.filter((document) => document.required);

/** How many onboarding documents a driver has submitted, of any kind. */
function documentCount(driver: Driver): number {
  return DRIVER_DOCUMENTS.filter((document) => driver[document.key]).length;
}

/**
 * How many of the required ones are in.
 *
 * The vehicle photo is deliberately not required: the rider app's onboarding
 * checklist never asks for one — it is collected in the driver app — so gating
 * approval on it would make every application from the rider app impossible to
 * approve.
 */
function requiredDocumentCount(driver: Driver): number {
  return REQUIRED_DOCUMENTS.filter((document) => driver[document.key]).length;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function AdminPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@smartride.local");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [driverStatus, setDriverStatus] = useState<DriverStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drivers, setDrivers] = useState<PageResult<Driver>>(emptyPage);
  const [riders, setRiders] = useState<PageResult<Rider>>(emptyPage);
  const [waitlist, setWaitlist] = useState<WaitlistResult>(emptyWaitlist);
  const [rides, setRides] = useState<PageResult<Ride>>(emptyPage);
  const [reports, setReports] = useState<PageResult<ReportItem>>(emptyPage);
  const [promos, setPromos] = useState<PageResult<Promo>>(emptyPage);
  const [transactions, setTransactions] =
    useState<PageResult<Transaction>>(emptyPage);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Driver | null>(null);
  const [reviewing, setReviewing] = useState<Driver | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [promoDraft, setPromoDraft] = useState({
    code: "",
    description: "",
    kind: "percentage" as "percentage" | "fixed",
    value: "10",
    minFareNaira: "0",
    maxDiscountNaira: "",
    maxRedemptions: "",
    perRiderLimit: "1",
    expiresAt: "",
  });

  useEffect(() => {
    setToken(localStorage.getItem("smartRideAdminToken"));
  }, []);

  const request = async <T,>(
    path: string,
    init?: Parameters<typeof apiRequest<T>>[1],
  ) => apiRequest<T>(path, { ...init, token });

  const loadWaitlist = async (): Promise<WaitlistResult> => {
    const firstPage = await request<WaitlistResult>("/waitlist?limit=100");

    if (firstPage.items.length >= firstPage.total) return firstPage;

    const remainingPages = await Promise.all(
      Array.from(
        { length: Math.ceil((firstPage.total - firstPage.items.length) / 100) },
        (_item, index) =>
          request<WaitlistResult>(
            `/waitlist?limit=100&skip=${(index + 1) * 100}`,
          ),
      ),
    );

    return {
      ...firstPage,
      items: [
        ...firstPage.items,
        ...remainingPages.flatMap((page) => page.items),
      ],
      limit: firstPage.total,
      skip: 0,
    };
  };

  const loadAll = async () => {
    if (!token) return;

    setBusy(true);
    setMessage(null);
    try {
      const [
        nextOverview,
        nextDrivers,
        nextRiders,
        nextWaitlist,
        nextRides,
        nextReports,
        nextPromos,
        nextTransactions,
      ] = await Promise.all([
        request<Overview>("/admin/overview"),
        request<PageResult<Driver>>(`/admin/drivers?status=${driverStatus}`),
        request<PageResult<Rider>>("/admin/riders"),
        loadWaitlist(),
        request<PageResult<Ride>>("/admin/rides"),
        request<PageResult<ReportItem>>("/admin/reports"),
        request<PageResult<Promo>>("/admin/promos"),
        request<PageResult<Transaction>>("/admin/transactions"),
      ]);
      setOverview(nextOverview);
      setDrivers(nextDrivers);
      setRiders(nextRiders);
      setWaitlist(nextWaitlist);
      setRides(nextRides);
      setReports(nextReports);
      setPromos(nextPromos);
      setTransactions(nextTransactions);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load admin data",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, driverStatus]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const session = await apiRequest<AdminSession>("/admin/auth/sign-in", {
        method: "POST",
        body: { email, password },
      });
      localStorage.setItem("smartRideAdminToken", session.accessToken);
      setToken(session.accessToken);
      setMessage("Signed in successfully");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("smartRideAdminToken");
    setToken(null);
  };

  const approveDriver = async (driver: Driver) => {
    setBusy(true);
    setMessage(null);
    try {
      await request<Driver>(`/admin/drivers/${driver.id}/approve`, {
        method: "POST",
      });
      setMessage(`${driver.name} approved`);
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not approve driver",
      );
    } finally {
      setBusy(false);
    }
  };

  const rejectDriver = async () => {
    if (!rejecting) return;
    setBusy(true);
    setMessage(null);
    try {
      await request<Driver>(`/admin/drivers/${rejecting.id}/reject`, {
        method: "POST",
        body: { reason: rejectReason },
      });
      setMessage(`${rejecting.name} rejected`);
      setRejecting(null);
      setRejectReason("");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not reject driver",
      );
    } finally {
      setBusy(false);
    }
  };

  const createPromo = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      await request<Promo>("/admin/promos", {
        method: "POST",
        body: {
          code: promoDraft.code,
          description: promoDraft.description,
          kind: promoDraft.kind,
          value: Number(promoDraft.value),
          minFareNaira: Number(promoDraft.minFareNaira || 0),
          maxDiscountNaira: promoDraft.maxDiscountNaira
            ? Number(promoDraft.maxDiscountNaira)
            : null,
          maxRedemptions: promoDraft.maxRedemptions
            ? Number(promoDraft.maxRedemptions)
            : null,
          perRiderLimit: Number(promoDraft.perRiderLimit || 1),
          expiresAt: promoDraft.expiresAt || null,
          active: true,
        },
      });
      setPromoDraft({
        code: "",
        description: "",
        kind: "percentage",
        value: "10",
        minFareNaira: "0",
        maxDiscountNaira: "",
        maxRedemptions: "",
        perRiderLimit: "1",
        expiresAt: "",
      });
      setMessage("Promo created successfully");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create promo",
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePromo = async (promo: Promo) => {
    setBusy(true);
    setMessage(null);
    try {
      await request<Promo>(`/admin/promos/${promo.id}`, {
        method: "PATCH",
        body: { active: !promo.active },
      });
      setMessage(promo.active ? "Promo paused" : "Promo activated");
      await loadAll();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update promo",
      );
    } finally {
      setBusy(false);
    }
  };

  // Filter items based on search query
  const filteredDrivers = useMemo(() => {
    if (!searchQuery.trim()) return drivers.items;
    const q = searchQuery.toLowerCase();
    return drivers.items.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.vehicle.toLowerCase().includes(q) ||
        d.plate.toLowerCase().includes(q),
    );
  }, [drivers.items, searchQuery]);

  const filteredRiders = useMemo(() => {
    if (!searchQuery.trim()) return riders.items;
    const q = searchQuery.toLowerCase();
    return riders.items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [riders.items, searchQuery]);

  const filteredWaitlist = useMemo(() => {
    if (!searchQuery.trim()) return waitlist.items;
    const q = searchQuery.toLowerCase();
    return waitlist.items.filter(
      (entry) =>
        entry.email.toLowerCase().includes(q) ||
        entry.city.toLowerCase().includes(q) ||
        entry.role.toLowerCase().includes(q),
    );
  }, [waitlist.items, searchQuery]);

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-header">
            <div className="brand-mark">
              <img
                src="/logo.png"
                alt="Smart Ride Logo"
                className="brand-logo-img"
              />
            </div>
            <div className="brand-title">
              <p>Smart Ride</p>
              <h1>Operations Console</h1>
            </div>
          </div>

          <form
            onSubmit={signIn}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@smartride.com"
                required
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    passwordVisible ? "Hide password" : "Show password"
                  }
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", marginTop: "8px" }}
            >
              {busy ? <RefreshCw className="animate-spin" size={16} /> : null}
              {busy ? "Signing in..." : "Sign in to console"}
            </button>
          </form>

          {message && <div className="toast-notice error">{message}</div>}

          <div
            style={{
              textAlign: "center",
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            Connected to <strong>{API_BASE}</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="console-wrapper">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-mark">
            <img
              src="/logo.png"
              alt="Smart Ride Logo"
              className="brand-logo-img"
            />
          </div>
          <div className="brand-title">
            <p>Smart Ride</p>
            <h1>Admin Console</h1>
          </div>
        </div>

        <nav className="nav-group">
          {VIEWS.map((item) => {
            const IconComponent = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  setView(item.id);
                  setSearchQuery("");
                }}
              >
                <div className="nav-item-content">
                  <IconComponent size={18} />
                  <span>{item.label}</span>
                </div>
                {item.id === "drivers" && overview?.pendingDrivers ? (
                  <span className="nav-badge">{overview.pendingDrivers}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="user-profile-card">
          <div className="user-profile-info">
            <div className="user-avatar">AD</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>
                System Admin
              </span>
              <span
                style={{ fontSize: "11px", color: "var(--text-secondary)" }}
              >
                Ops Lead
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={signOut}
            title="Sign out"
            style={{ minHeight: "36px", width: "36px", padding: 0 }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <main className="workspace-canvas">
        <header className="topbar-header">
          <div className="topbar-title">
            <p>Smart Ride Operations</p>
            <h2>{VIEWS.find((item) => item.id === view)?.label}</h2>
          </div>

          <div className="topbar-actions">
            {(view === "drivers" ||
              view === "riders" ||
              view === "waitlist") && (
              <div className="search-pill-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder={`Search ${view}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadAll()}
              disabled={busy}
            >
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {message && <div className="toast-notice">{message}</div>}

        {/* OVERVIEW VIEW */}
        {view === "overview" && overview && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            <div className="metrics-grid">
              <MetricCard
                icon={Clock}
                tone="warn"
                label="Pending drivers"
                value={overview.pendingDrivers}
                subtitle="Requires ops verification"
              />
              <MetricCard
                icon={Car}
                tone="success"
                label="Active rides"
                value={overview.activeRides}
                subtitle="Trips currently en route"
              />
              <MetricCard
                icon={RadioIcon}
                tone="success"
                label="Online drivers"
                value={overview.onlineDrivers}
                subtitle="Drivers available on map"
              />
              <MetricCard
                icon={TrendingUp}
                label="Revenue (Today)"
                value={formatNaira(overview.revenueNaira)}
                subtitle="Gross trip volume"
              />
            </div>

            <div className="metrics-grid">
              <MetricCard
                icon={CheckCircle2}
                label="Completed today"
                value={overview.completedToday}
              />
              <MetricCard
                icon={Users}
                label="Total riders"
                value={overview.riders}
              />
              <MetricCard
                icon={UserCheck}
                label="Total drivers"
                value={overview.drivers}
              />
              <MetricCard
                icon={ShieldAlert}
                tone="danger"
                label="Open reports"
                value={overview.reportsOpen}
              />
            </div>

            <div className="map-snapshot-card">
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <div
                  className="status-pill verified"
                  style={{ width: "fit-content" }}
                >
                  <Zap size={12} /> Live Ops Region
                </div>
                <h3 style={{ fontSize: "20px", fontWeight: "700" }}>
                  Zaria & Lokoja Operations Corridor
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  Real-time OpenStreetMap dispatch grid active.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DRIVERS VIEW */}
        {view === "drivers" && (
          <section className="content-panel">
            <div className="panel-toolbar">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  Driver Applications
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {filteredDrivers.length} drivers found in {driverStatus} list
                </p>
              </div>

              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <Filter size={16} color="var(--text-secondary)" />
                <select
                  value={driverStatus}
                  onChange={(e) =>
                    setDriverStatus(e.target.value as DriverStatus)
                  }
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved Drivers</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All Applications</option>
                </select>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header driver-grid-cols">
                <span>Driver</span>
                <span>Vehicle Info</span>
                <span>Status</span>
                <span>Performance</span>
                <span>Actions</span>
              </div>

              {filteredDrivers.map((driver) => (
                <div className="table-row driver-grid-cols" key={driver.id}>
                  <div className="row-user-info">
                    <div className="user-avatar">
                      {getInitials(driver.name)}
                    </div>
                    <div className="details">
                      <span className="name">{driver.name}</span>
                      <span className="subtext">
                        {driver.email} • {driver.phone}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="vehicle-chip">
                      <Car size={13} /> {driver.vehicle}
                    </span>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "4px",
                      }}
                    >
                      Plate: <strong>{driver.plate}</strong> • Tier:{" "}
                      <span style={{ textTransform: "capitalize" }}>
                        {driver.tier}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className={`status-pill ${driver.applicationStatus}`}>
                      {driver.applicationStatus}
                    </span>
                  </div>

                  <div>
                    <div className="rating-badge">
                      <Star size={13} /> {driver.rating.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      {driver.trips} trips • {formatNaira(driver.earningsNaira)}
                    </div>
                  </div>

                  <div className="row-actions-group">
                    <button
                      type="button"
                      className="btn-sm btn-secondary"
                      onClick={() => setReviewing(driver)}
                      title="Review submitted documents"
                    >
                      <FileText size={14} /> Docs {documentCount(driver)}/
                      {DRIVER_DOCUMENTS.length}
                    </button>

                    {driver.applicationStatus === "pending" ||
                    !driver.approved ? (
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => void approveDriver(driver)}
                        disabled={busy}
                      >
                        <Check size={14} /> Approve
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-sm btn-danger-outline"
                      onClick={() => setRejecting(driver)}
                      disabled={busy}
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RIDERS VIEW */}
        {view === "riders" && (
          <section className="content-panel">
            <div className="panel-toolbar">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  Rider Accounts
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {filteredRiders.length} registered riders
                </p>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header directory-grid-cols">
                <span>Rider</span>
                <span>Trips & Rating</span>
                <span>Email Status</span>
                <span>Joined Date</span>
              </div>

              {filteredRiders.map((rider) => (
                <div className="table-row directory-grid-cols" key={rider.id}>
                  <div className="row-user-info">
                    <div
                      className="user-avatar"
                      style={{ background: "var(--primary-soft)" }}
                    >
                      {getInitials(rider.name)}
                    </div>
                    <div className="details">
                      <span className="name">{rider.name}</span>
                      <span className="subtext">
                        {rider.email} • {rider.phone || "No phone"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="rating-badge">
                      <Star size={13} /> {rider.rating.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      {rider.tripCount} completed trips
                    </div>
                  </div>

                  <div>
                    <span
                      className={`status-pill ${rider.isEmailVerified ? "verified" : "unverified"}`}
                    >
                      {rider.isEmailVerified ? "Verified" : "Unverified"}
                    </span>
                  </div>

                  <div
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    {formatDate(rider.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* WAITLIST VIEW */}
        {view === "waitlist" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            <div className="metrics-grid">
              <MetricCard
                icon={ClipboardList}
                label="Total waitlist"
                value={waitlist.total}
                subtitle="People waiting for app booking"
              />
              <MetricCard
                icon={Users}
                tone="success"
                label="Customers"
                value={waitlist.riders}
                subtitle="Personal and team booking interest"
              />
              <MetricCard
                icon={Car}
                tone="warn"
                label="Driver role entries"
                value={waitlist.drivers}
                subtitle="Legacy signups before customer-only positioning"
              />
            </div>

            <section className="content-panel">
              <div className="panel-toolbar">
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                    Waitlist Signups
                  </h3>
                  <p
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    Showing {filteredWaitlist.length} of {waitlist.total} email
                    addresses
                  </p>
                </div>
              </div>

              <div className="table-container">
                <div className="table-header waitlist-grid-cols">
                  <span>Email</span>
                  <span>Area</span>
                  <span>Type</span>
                  <span>Source</span>
                  <span>Joined</span>
                </div>

                {filteredWaitlist.map((entry) => (
                  <div className="table-row waitlist-grid-cols" key={entry.id}>
                    <div className="row-user-info">
                      <div
                        className="user-avatar"
                        style={{ background: "var(--primary-soft)" }}
                      >
                        {entry.email.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="details">
                        <span className="name">{entry.email}</span>
                        <span className="subtext">
                          Updated {formatDate(entry.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {entry.city || "Not provided"}
                    </div>

                    <div>
                      <span
                        className={`status-pill ${entry.role === "rider" ? "verified" : "paused"}`}
                      >
                        {entry.role === "rider" ? "Customer" : "Driver"}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {entry.source || "landing"}
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {formatDate(entry.createdAt)}
                    </div>
                  </div>
                ))}

                {!filteredWaitlist.length && (
                  <div className="empty-state">
                    <ClipboardList size={24} />
                    <span>No waitlist signups found</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* RIDES VIEW */}
        {view === "rides" && (
          <section className="content-panel">
            <div className="panel-toolbar">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  Ride History & Dispatch Log
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {rides.total} total dispatch trips
                </p>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header ride-grid-cols">
                <span>Route / Rider</span>
                <span>Fare & Payment</span>
                <span>Status</span>
                <span>Timestamp</span>
              </div>

              {rides.items.map((ride) => (
                <div className="table-row ride-grid-cols" key={ride.id}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600" }}>
                      {personName(ride.rider)} → {ride.dropoff.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "3px",
                      }}
                    >
                      Pickup: {ride.pickup.address}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Dropoff: {ride.dropoff.address}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "700" }}>
                      {formatNaira(ride.fare.totalNaira + ride.tipNaira)}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      {ride.tier} • {ride.payment} • {ride.paymentStatus}
                    </div>
                  </div>

                  <div>
                    <span className={`status-pill ${ride.status}`}>
                      {ride.status}
                    </span>
                  </div>

                  <div
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    {formatDate(ride.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* REPORTS VIEW */}
        {view === "reports" && (
          <section className="content-panel">
            <div className="panel-toolbar">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  Safety & Support Reports
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {reports.total} open incident flags
                </p>
              </div>
            </div>

            <div className="table-container">
              {reports.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "20px",
                    borderRadius: "16px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span className="status-pill rejected">
                      <AlertCircle size={14} />{" "}
                      {item.report.category.replaceAll("_", " ")}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {formatDate(item.report.createdAt)}
                    </span>
                  </div>

                  <div
                    style={{ fontSize: "14px", color: "var(--text-primary)" }}
                  >
                    {item.report.details ||
                      "No detail notes provided by rider."}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      paddingTop: "10px",
                      borderTop: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span>
                      Rider: <strong>{personName(item.ride.rider)}</strong>
                    </span>
                    <span>
                      Route: {item.ride.pickup.name} → {item.ride.dropoff.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PROMOS VIEW */}
        {view === "promos" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 380px) 1fr",
              gap: "24px",
            }}
          >
            <form className="content-panel" onSubmit={createPromo}>
              <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                Create Promo Code
              </h3>

              <label>
                Promo code
                <input
                  type="text"
                  placeholder="e.g. SMART20"
                  value={promoDraft.code}
                  onChange={(e) =>
                    setPromoDraft((draft) => ({
                      ...draft,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  required
                />
              </label>

              <label>
                Description
                <input
                  type="text"
                  placeholder="20% off your next ride"
                  value={promoDraft.description}
                  onChange={(e) =>
                    setPromoDraft((draft) => ({
                      ...draft,
                      description: e.target.value,
                    }))
                  }
                  required
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <label>
                  Type
                  <select
                    value={promoDraft.kind}
                    onChange={(e) =>
                      setPromoDraft((draft) => ({
                        ...draft,
                        kind: e.target.value as "percentage" | "fixed",
                      }))
                    }
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed (NGN)</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    type="number"
                    min="1"
                    value={promoDraft.value}
                    onChange={(e) =>
                      setPromoDraft((draft) => ({
                        ...draft,
                        value: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <label>
                  Min fare (NGN)
                  <input
                    type="number"
                    min="0"
                    value={promoDraft.minFareNaira}
                    onChange={(e) =>
                      setPromoDraft((draft) => ({
                        ...draft,
                        minFareNaira: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Max discount (NGN)
                  <input
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={promoDraft.maxDiscountNaira}
                    onChange={(e) =>
                      setPromoDraft((draft) => ({
                        ...draft,
                        maxDiscountNaira: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{ width: "100%", marginTop: "8px" }}
              >
                <Plus size={16} /> Create Promo
              </button>
            </form>

            <section className="content-panel">
              <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                Active Campaigns
              </h3>
              <div className="table-container">
                {promos.items.map((promo) => (
                  <div
                    className="table-row"
                    style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}
                    key={promo.id}
                  >
                    <div>
                      <div
                        className="vehicle-chip"
                        style={{ fontWeight: "700" }}
                      >
                        <Ticket size={13} /> {promo.code}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          marginTop: "4px",
                        }}
                      >
                        {promo.description}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "15px", fontWeight: "700" }}>
                        {promo.kind === "fixed"
                          ? formatNaira(promo.value)
                          : `${promo.value}% OFF`}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {promo.redemptions} redemptions
                      </div>
                    </div>

                    <div>
                      <span
                        className={`status-pill ${promo.active ? "active" : "paused"}`}
                      >
                        {promo.active ? "Active" : "Paused"}
                      </span>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => void togglePromo(promo)}
                        disabled={busy}
                      >
                        {promo.active ? "Pause" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* PAYMENTS VIEW */}
        {view === "payments" && (
          <section className="content-panel">
            <div className="panel-toolbar">
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  Financial Transactions
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {transactions.total} gateway transactions logged
                </p>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header ride-grid-cols">
                <span>Reference / Purpose</span>
                <span>Amount & Rider</span>
                <span>Status</span>
                <span>Date Paid</span>
              </div>

              {transactions.items.map((t) => (
                <div className="table-row ride-grid-cols" key={t.id}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600" }}>
                      {t.reference}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {t.purpose}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "700" }}>
                      {formatNaira(t.amountKobo / 100)}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {personName(t.rider)}
                    </div>
                  </div>

                  <div>
                    <span className={`status-pill ${t.status}`}>
                      {t.status}
                    </span>
                  </div>

                  <div
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    {formatDate(t.paidAt ?? t.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Driver Rejection Reason Modal */}
      {reviewing && (
        <div className="modal-overlay">
          <div className="modal-dialog modal-wide">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                  {reviewing.name}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {reviewing.vehicle} • Plate {reviewing.plate} •{" "}
                  <span style={{ textTransform: "capitalize" }}>
                    {reviewing.tier}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setReviewing(null)}
                style={{ padding: 0, minHeight: "32px", width: "32px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="review-meta">
              <span className={`status-pill ${reviewing.applicationStatus}`}>
                {reviewing.applicationStatus}
              </span>
              <span
                style={{ fontSize: "13px", color: "var(--text-secondary)" }}
              >
                {reviewing.email} • {reviewing.phone}
              </span>
            </div>

            {reviewing.applicationStatus === "rejected" &&
              reviewing.rejectionReason && (
                <div className="review-reason">
                  <AlertCircle size={15} />
                  <span>Previously rejected: {reviewing.rejectionReason}</span>
                </div>
              )}

            <div className="document-grid">
              {DRIVER_DOCUMENTS.map((document) => {
                const url = reviewing[document.key];

                return (
                  <div className="document-card" key={document.key}>
                    <div className="document-card-head">
                      <span className="document-label">
                        {document.label}
                        {!document.required && (
                          // Says why a gap here does not block approval.
                          <span className="document-optional"> · optional</span>
                        )}
                      </span>
                      {url ? (
                        <CheckCircle2 size={14} className="document-ok" />
                      ) : (
                        <Clock size={14} className="document-missing" />
                      )}
                    </div>

                    {url ? (
                      // Opens the untouched original, since a reviewer often
                      // needs to zoom into small print the thumbnail loses.
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Image
                          src={url}
                          alt={document.label}
                          width={320}
                          height={220}
                          className="document-image"
                          unoptimized
                        />
                      </a>
                    ) : (
                      <div className="document-empty">
                        <FileText size={22} />
                        <span>Not submitted</span>
                      </div>
                    )}

                    <span className="document-hint">
                      {url ? "Click to open full size" : document.hint}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReviewing(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => {
                  setRejecting(reviewing);
                  setReviewing(null);
                }}
                disabled={busy}
              >
                <X size={14} /> Reject
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  const driver = reviewing;
                  setReviewing(null);
                  void approveDriver(driver);
                }}
                disabled={
                  busy || requiredDocumentCount(reviewing) < REQUIRED_DOCUMENTS.length
                }
                title={
                  requiredDocumentCount(reviewing) < REQUIRED_DOCUMENTS.length
                    ? `All ${REQUIRED_DOCUMENTS.length} required documents must be submitted before approval`
                    : "Approve this driver"
                }
              >
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ fontSize: "18px", fontWeight: "700" }}>
                Reject {rejecting.name}
              </h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRejecting(null)}
                style={{ padding: 0, minHeight: "32px", width: "32px" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Provide a clear reason for rejecting this driver application. The
              reason will be sent to the driver and recorded in audit logs.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Driver license document expired or plate number mismatch."
              rows={4}
            />

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejecting(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void rejectDriver()}
                disabled={busy || rejectReason.trim().length < 3}
              >
                {busy ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: IconComponent,
  tone,
  label,
  value,
  subtitle,
}: {
  icon: React.ElementType;
  tone?: "warn" | "danger" | "success";
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span
          style={{
            fontSize: "13px",
            fontWeight: "500",
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </span>
        <div className={`metric-icon-box ${tone ?? ""}`}>
          <IconComponent size={20} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      {subtitle ? <div className="metric-footer">{subtitle}</div> : null}
    </div>
  );
}

function RadioIcon(props: { size?: number; className?: string }) {
  return (
    <svg
      width={props.size || 20}
      height={props.size || 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  );
}
