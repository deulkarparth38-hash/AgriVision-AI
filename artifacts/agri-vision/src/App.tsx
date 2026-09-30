import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Camera, Check, ChevronRight, CircleHelp, Cloud, CloudRain, CloudSun, Droplets,
  FileText, LoaderCircle, LogOut, MapPin, Menu, MessageSquare, Plus, Send,
  ShieldCheck, Sprout, Sun, Trash2, TrendingUp, Upload, Wind, X, Wheat,
} from 'lucide-react';
import {
  getGetAdvisoryQueryKey, getGetConversationQueryKey, getGetDashboardSummaryQueryKey,
  getGetDiagnosisQueryKey, getGetMarketSummaryQueryKey, getGetProfileQueryKey, getGetSessionQueryKey,
  getGetWeatherForecastQueryKey, getListAdvisoriesQueryKey, getListConversationsQueryKey,
  getListDiagnosesQueryKey, getListMarketObservationsQueryKey, useCreateAdvisory,
  useCreateConversation, useCreateDiagnosis, useCreateMarketObservation, useDeleteAdvisory,
  useDeleteConversation, useDeleteDiagnosis, useDeleteMarketObservation, useGetAdvisory,
  useGetConversation, useGetDashboardSummary, useGetDiagnosis, useGetMarketSummary, useGetProfile,
  useGetSession, useGetWeatherForecast, useHealthCheck, useListAdvisories,
  useListConversations, useListDiagnoses, useListMarketObservations, useLogin, useLogout,
  useRegister, useSendConversationMessage, useUpdateProfile,
} from '@workspace/api-client-react';
import type { Advisory, Diagnosis, FarmProfileInput } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const navItems = [
  { href: '/', label: 'Field desk', icon: Activity },
  { href: '/advisory/new', label: 'Crop planning', icon: Sprout },
  { href: '/diagnose', label: 'Photo diagnosis', icon: Camera },
  { href: '/market', label: 'Market & ROI', icon: TrendingUp },
  { href: '/chat', label: 'AgriBot', icon: MessageSquare },
  { href: '/history', label: 'Field history', icon: BookOpen },
  { href: '/profile', label: 'Farm profile', icon: MapPin },
];

const fmtDate = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const fmtMoney = (value?: number | null, currency = 'USD') => value == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
const titleCase = (value?: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not set';
const numericOrNull = (value: string) => value === '' ? null : Number(value);

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden="true" />;
}

function LoadingBlock({ label = 'Loading field data' }: { label?: string }) {
  return <div className="grid gap-3" role="status" aria-label={label} data-testid="status-loading">
    <Skeleton className="h-8 w-40" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
  </div>;
}

function ErrorState({ title = 'Could not load this view', detail = 'Your saved field data is still safe. Try again in a moment.', onRetry }: { title?: string; detail?: string; onRetry: () => void }) {
  return <div className="card p-7 text-center" data-testid="status-error">
    <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]"><CircleHelp size={18} /></div>
    <h3 className="font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
    <button className="btn btn-quiet mt-5" onClick={onRetry} data-testid="button-retry"><Activity size={15} /> Try again</button>
  </div>;
}

function EmptyState({ icon: Icon = Sprout, title, detail, action }: { icon?: typeof Sprout; title: string; detail: string; action?: ReactNode }) {
  return <div className="card grid min-h-52 place-items-center p-8 text-center" data-testid="state-empty">
    <div><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--accent)/.55)] text-primary"><Icon size={21} /></div>
      <h3 className="serif text-2xl">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{detail}</p>{action && <div className="mt-5">{action}</div>}</div>
  </div>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
    <div><div className="eyebrow mb-3 text-primary">{kicker}</div><h1 className="section-title">{title}</h1><p className="section-subtitle mt-2 max-w-2xl">{description}</p></div>
    {action}
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const health = useHealthCheck();
  const logout = useLogout();
  const qc = useQueryClient();
  const active = navItems.find((item) => item.href === location) ?? (location.startsWith('/advisory/') ? navItems[1] : location.startsWith('/diagnose') ? navItems[2] : navItems[0]);
  const signOut = () => logout.mutate(undefined, { onSuccess: () => { qc.setQueryData(getGetSessionQueryKey(), { authenticated: false, user: null }); setLocation('/auth'); } });
  const farmName = profile.data?.farmName || 'Your farm';
  const personName = session.data?.user?.name?.split(' ')[0] || 'Farmer';
  return <div className="grain min-h-[100dvh] bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[82px] items-center gap-3 px-6">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"><Sprout size={21} strokeWidth={2.3} /></div>
        <div><div className="font-semibold tracking-tight text-sidebar-foreground">AgriVision <span className="text-sidebar-primary">AI</span></div><div className="eyebrow mt-1 text-sidebar-foreground/55">Field intelligence</div></div>
        <button onClick={() => setMobileNav(false)} className="ml-auto md:hidden" aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
      </div>
      <div className="mx-4 mb-5 rounded-xl border border-sidebar-border bg-sidebar-accent/70 p-3">
        <div className="eyebrow text-sidebar-foreground/50">Current field</div><div className="mt-1 truncate text-sm font-semibold">{farmName}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-sidebar-foreground/60"><MapPin size={12} />{profile.data ? `${profile.data.region}, ${profile.data.country}` : 'Add a farm location'}</div>
      </div>
      <div className="eyebrow px-6 pb-2 text-sidebar-foreground/45">Workspace</div>
      <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setMobileNav(false)} data-testid={`link-nav-${href.replaceAll('/', '') || 'home'}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition-colors ${active.href === href ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground'}`}>
          <Icon size={17} strokeWidth={1.8} /><span className="flex-1">{label}</span>{active.href === href && <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
        </Link>)}
      </nav>
      <div className="mx-4 mb-4 rounded-xl border border-sidebar-border/80 p-3">
        <div className="flex items-center justify-between"><span className="eyebrow text-sidebar-foreground/50">System status</span><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-amber-400' : 'bg-lime-300'}`} /></div>
        <div className="mt-2 flex items-center justify-between text-xs text-sidebar-foreground/75"><span>{health.isError ? 'Offline mode' : 'Field services ready'}</span><span className="mono text-[10px]">{health.isLoading ? '…' : health.data?.status || (health.isError ? 'LOCAL' : 'OK')}</span></div>
      </div>
      <div className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar-primary/20 text-xs font-bold text-sidebar-primary">{personName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{session.data?.user?.name || 'Guest farmer'}</div><div className="truncate text-xs text-sidebar-foreground/55">{session.data?.user?.role ? titleCase(session.data.user.role) : 'Sign in to sync'}</div></div>
        {session.data?.authenticated ? <button onClick={signOut} title="Sign out" disabled={logout.isPending} className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-sign-out"><LogOut size={16} /></button> : <Link href="/auth" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="link-sign-in"><ArrowRight size={16} /></Link>}
      </div>
    </aside>
    {mobileNav && <button className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMobileNav(false)} aria-label="Dismiss navigation" data-testid="button-dismiss-navigation" />}
    <div className="md:pl-[250px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-lg sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-border md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={18} /></button><div className="eyebrow hidden text-muted-foreground sm:block">FIELD NOTE / <span className="text-foreground">{active.label.toUpperCase()}</span></div><div className="eyebrow text-muted-foreground sm:hidden">{active.label}</div></div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-amber-500' : 'bg-primary'}`} />{health.isError ? 'Limited connectivity' : 'Live field context'}</div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('agri-refresh'))} className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground hover:bg-secondary" aria-label="Refresh view" data-testid="button-refresh-view"><Bell size={16} /></button>
          <Link href="/profile" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" data-testid="link-account">{personName.slice(0, 1).toUpperCase()}</Link>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100dvh-68px)] max-w-[1480px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
        <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 py-5 text-xs text-muted-foreground"><span>AgriVision AI · Guidance for the ground you know.</span><span className="mono">ADVISORY IS AI-GENERATED · VERIFY BEFORE ACTING</span></footer>
      </main>
    </div>
  </div>;
}

function Dashboard() {
  const qc = useQueryClient();
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const summary = useGetDashboardSummary({ query: { enabled: !!session.data?.authenticated, queryKey: getGetDashboardSummaryQueryKey() } });
  const profileData = profile.data;
  const weatherParams = { latitude: profileData?.latitude ?? 0, longitude: profileData?.longitude ?? 0 };
  const weather = useGetWeatherForecast(weatherParams, { query: { enabled: !!session.data?.authenticated && profileData?.latitude != null && profileData.longitude != null, queryKey: getGetWeatherForecastQueryKey(weatherParams) } });
  const advisories = summary.data?.recentAdvisories ?? [];
  const diagnoses = summary.data?.recentDiagnoses ?? [];
  useEffect(() => { const handler = () => { void qc.invalidateQueries(); }; window.addEventListener('agri-refresh', handler); return () => window.removeEventListener('agri-refresh', handler); }, [qc]);
  if (session.isLoading) return <LoadingBlock />;
  return <div className="page-enter">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><div className="eyebrow mb-3 text-primary">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} <span className="text-muted-foreground">/ FIELD BRIEF</span></div>
        <h1 className="section-title">Good morning, {session.data?.user?.name?.split(' ')[0] || 'there'}.</h1>
        <p className="section-subtitle mt-2">{profileData ? `A clear view of ${profileData.farmName} and what may need attention.` : 'Your farm details make every recommendation more useful.'}</p>
      </div>
      <Link href="/advisory/new" className="btn btn-primary" data-testid="button-new-plan"><Plus size={16} /> Build a crop plan <ArrowRight size={15} /></Link>
    </div>
    {!session.data?.authenticated && <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-[hsl(var(--accent)/.34)] p-5 sm:flex-row sm:items-center"><div><div className="font-semibold">Your field desk is ready to personalize.</div><p className="mt-1 text-sm text-muted-foreground">Sign in to save plans, diagnose crop issues and bring your farm context into every answer.</p></div><Link className="btn btn-primary self-start" href="/auth" data-testid="button-dashboard-auth">Sign in / create account <ArrowRight size={15} /></Link></div>}
    <div className="grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
      <section className="overflow-hidden rounded-[22px] bg-[hsl(var(--primary))] p-6 text-primary-foreground shadow-sm sm:p-8" data-testid="card-field-context">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="eyebrow text-primary-foreground/60">FIELD CONDITIONS / 01</div><div className="serif mt-3 text-3xl">{profileData?.region || 'Set your farm location'}</div><div className="mt-1 flex items-center gap-1.5 text-sm text-primary-foreground/70"><MapPin size={14} />{profileData?.country || 'Location context powers local guidance'}</div></div>
          <div className="rounded-full border border-primary-foreground/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground/75">Context-aware</div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-primary-foreground/15 pt-5 sm:grid-cols-4">
          <div><div className="eyebrow text-primary-foreground/55">Area</div><div className="mt-1.5 font-semibold">{profileData?.areaHa != null ? `${profileData.areaHa} ha` : 'Add area'}</div></div>
          <div><div className="eyebrow text-primary-foreground/55">Main crops</div><div className="mt-1.5 truncate font-semibold">{profileData?.crops?.join(', ') || 'Add crops'}</div></div>
          <div><div className="eyebrow text-primary-foreground/55">Soil type</div><div className="mt-1.5 font-semibold">{profileData?.soilType || 'Not recorded'}</div></div>
          <div><div className="eyebrow text-primary-foreground/55">Irrigation</div><div className="mt-1.5 font-semibold">{profileData?.irrigation || 'Not recorded'}</div></div>
        </div>
        {!profileData && <Link href="/profile" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline decoration-primary-foreground/40 underline-offset-4" data-testid="link-add-farm-context">Complete farm profile <ArrowRight size={14} /></Link>}
      </section>
      <section className="card p-5 sm:p-6" data-testid="card-weather">
        <div className="flex items-start justify-between"><div><div className="eyebrow text-primary">NEXT 5 DAYS / WEATHER</div><h2 className="serif mt-2 text-2xl">{weather.data?.locationLabel || 'Local outlook'}</h2></div><CloudSun className="text-primary" size={24} /></div>
        {weather.isLoading ? <div className="mt-5 grid grid-cols-5 gap-2">{[1,2,3,4,5].map((n) => <Skeleton key={n} className="h-20" />)}</div>
          : weather.isError ? <div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Forecast unavailable. Add your farm coordinates to see a local outlook.</div>
          : weather.data ? <><div className="mt-5 grid grid-cols-5 gap-1 text-center" data-testid="data-weather-days">{weather.data.days.slice(0,5).map((day, i) => <div key={day.date} className="rounded-xl bg-background/75 px-1 py-3"><div className="mono text-[9px] text-muted-foreground">{i === 0 ? 'TODAY' : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(day.date))}</div><div className="my-2 flex justify-center text-primary">{day.precipitationProbability > 45 ? <CloudRain size={18} /> : day.maxC > 29 ? <Sun size={18} /> : <CloudSun size={18} />}</div><div className="text-xs font-semibold">{Math.round(day.maxC)}°</div><div className="mt-0.5 text-[10px] text-muted-foreground">{Math.round(day.minC)}°</div></div>)}</div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground"><span>Source: {weather.data.source}</span><span>Updated {fmtDate(weather.data.updatedAt)}</span></div>
            {weather.data.risks.slice(0,1).map((risk) => <div key={risk.type} className="mt-3 flex gap-2 rounded-xl bg-[hsl(var(--accent)/.4)] p-3 text-xs leading-5"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" /><span><b>{titleCase(risk.level)} {titleCase(risk.type)} watch.</b> {risk.detail}</span></div>)}
          </> : <div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Add coordinates to your farm profile for a local forecast.</div>}
      </section>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: 'Saved crop plans', value: summary.data?.advisoryCount, icon: FileText, tint: 'bg-[hsl(var(--accent)/.55)]' },
        { label: 'Plant checks', value: summary.data?.diagnosisCount, icon: Camera, tint: 'bg-[hsl(var(--chart-4)/.16)]' },
        { label: 'Price notes', value: summary.data?.observationCount, icon: TrendingUp, tint: 'bg-[hsl(var(--chart-3)/.18)]' },
        { label: 'AgriBot chats', value: summary.data?.conversationCount, icon: MessageSquare, tint: 'bg-[hsl(var(--chart-5)/.13)]' },
      ].map(({ label, value, icon: Icon, tint }) => <div className="card flex items-center gap-3 p-4 sm:p-5" key={label} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint} text-primary`}><Icon size={18} /></div><div><div className="mono text-[20px] leading-none">{summary.isLoading ? '—' : value ?? '—'}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div></div>)}
    </div>
    <div className="mt-8 grid gap-7 xl:grid-cols-[1.15fr_.85fr]">
      <section>
        <div className="mb-4 flex items-end justify-between"><div><div className="eyebrow text-muted-foreground">RECENT / ADVISORY</div><h2 className="serif mt-1 text-2xl">Plans in motion</h2></div><Link href="/history" className="text-xs font-semibold text-primary hover:underline" data-testid="link-view-history">View history <ArrowRight className="ml-1 inline" size={13} /></Link></div>
        {summary.isLoading ? <LoadingBlock /> : summary.isError ? <ErrorState onRetry={() => void summary.refetch()} /> : advisories.length ? <div className="grid gap-3">{advisories.slice(0,3).map((item) => <AdvisoryCard key={item.id} item={item} />)}</div> : <EmptyState title="No plans saved yet" detail="Build a seasonal crop plan using your soil, budget and local context." action={<Link href="/advisory/new" className="btn btn-primary" data-testid="button-empty-plan">Start a plan <ArrowRight size={15} /></Link>} />}
      </section>
      <section>
        <div className="mb-4"><div className="eyebrow text-muted-foreground">RECENT / CROP HEALTH</div><h2 className="serif mt-1 text-2xl">Latest field checks</h2></div>
        {summary.isLoading ? <LoadingBlock /> : summary.isError ? <ErrorState onRetry={() => void summary.refetch()} /> : diagnoses.length ? <div className="grid gap-3">{diagnoses.slice(0,3).map((item) => <DiagnosisCard key={item.id} item={item} />)}</div> : <EmptyState icon={Camera} title="No plant checks yet" detail="Add a clear crop photo to get a labeled, AI-generated first read." action={<Link href="/diagnose" className="btn btn-quiet" data-testid="button-empty-diagnose"><Camera size={15} /> Check a plant</Link>} />}
      </section>
    </div>
    <div className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-6"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--chart-3)/.18)] text-[hsl(var(--chart-3))]"><Wind size={18} /></div><div><div className="font-semibold">Need a second set of eyes?</div><p className="mt-1 text-sm text-muted-foreground">Ask AgriBot with your farm profile in context. Its guidance is clearly labeled and easy to revisit.</p></div></div><Link href="/chat" className="btn btn-soft self-start sm:self-auto" data-testid="button-talk-agrobot">Ask AgriBot <ArrowRight size={15} /></Link></div>
  </div>;
}

function AdvisoryCard({ item }: { item: Advisory }) {
  return <Link href={`/advisory/${item.id}`} className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-sm" data-testid={`card-advisory-${item.id}`}>
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent)/.55)] text-primary"><Wheat size={19} /></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.crop}</h3><span className="status-pill bg-secondary text-secondary-foreground">{item.season}</span></div><div className="mt-1 truncate text-xs text-muted-foreground">{item.region} · {fmtDate(item.createdAt)}</div></div>
    <div className="hidden text-right sm:block"><div className="eyebrow text-muted-foreground">CONFIDENCE</div><div className="mt-1 text-xs font-semibold">{titleCase(item.report.confidence)}</div></div><ChevronRight size={17} className="text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
  </Link>;
}

function DiagnosisCard({ item }: { item: Diagnosis }) {
  return <Link href={`/diagnose/${item.id}`} className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-sm" data-testid={`card-diagnosis-${item.id}`}>
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--chart-4)/.16)] text-[hsl(var(--chart-4))]"><Camera size={19} /></div>
    <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{item.report.likelyIssue}</h3><div className="mt-1 truncate text-xs text-muted-foreground">{item.crop || 'Crop not set'} · {item.region || 'Region not set'} · {fmtDate(item.createdAt)}</div></div>
    <span className="status-pill bg-secondary text-secondary-foreground">{titleCase(item.report.severity >= 4 ? 'high' : item.report.severity >= 3 ? 'moderate' : 'low')}</span><ChevronRight size={17} className="text-muted-foreground" />
  </Link>;
}

function AuthPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'farmer' });
  const login = useLogin();
  const register = useRegister();
  const pending = login.isPending || register.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const onSuccess = (session: { authenticated: boolean }) => { qc.setQueryData(getGetSessionQueryKey(), session); setLocation('/'); };
    const onError = (e: Error) => setError(e.message || 'We could not sign you in. Check your details and try again.');
    if (mode === 'signin') login.mutate({ data: { email: form.email, password: form.password } }, { onSuccess, onError });
    else register.mutate({ data: { name: form.name, email: form.email, password: form.password, role: form.role as 'farmer' | 'agronomist' | 'extension_worker' } }, { onSuccess, onError });
  };
  return <div className="grain grid min-h-[100dvh] bg-background lg:grid-cols-[1.02fr_.98fr]">
    <div className="relative hidden overflow-hidden bg-[hsl(var(--primary))] px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:px-20">
      <div className="absolute -right-20 top-[17%] h-[490px] w-[490px] rounded-full border border-primary-foreground/10" /><div className="absolute -right-5 top-[23%] h-[370px] w-[370px] rounded-full border border-primary-foreground/10" />
      <div className="relative flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"><Sprout size={21} /></div><span className="font-semibold">AgriVision <span className="text-sidebar-primary">AI</span></span></div>
      <div className="relative max-w-xl"><div className="eyebrow text-sidebar-primary">FIELDWORK, WITH BETTER CONTEXT</div><h1 className="serif mt-5 text-6xl leading-[.96] xl:text-7xl">Know your field.<br /><em>Act with clarity.</em></h1><p className="mt-6 max-w-md text-base leading-7 text-primary-foreground/70">A practical companion for crop plans, plant checks and market decisions—built around the details of your own farm.</p>
        <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">{[['01', 'Your farm details'], ['02', 'Current conditions'], ['03', 'Labeled AI guidance'], ['04', 'Decisions you can revisit']].map(([n, label]) => <div className="flex items-center gap-3 border-t border-primary-foreground/20 pt-3" key={n}><span className="mono text-xs text-sidebar-primary">{n}</span><span className="text-sm text-primary-foreground/80">{label}</span></div>)}</div>
      </div>
      <div className="relative flex items-center justify-between text-[10px] text-primary-foreground/50"><span>AGRI VISION SYSTEMS</span><span className="mono">GUIDANCE ≠ GUARANTEE</span></div>
    </div>
    <div className="flex min-h-[100dvh] flex-col justify-center px-5 py-10 sm:px-10 lg:px-14 xl:px-24">
      <div className="mb-12 flex items-center gap-3 lg:hidden"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><Sprout size={20} /></div><span className="font-semibold">AgriVision <span className="text-primary">AI</span></span></div>
      <div className="mx-auto w-full max-w-md">
        <div className="eyebrow text-primary">YOUR FIELD DESK</div><h2 className="serif mt-3 text-4xl">{mode === 'signin' ? 'Welcome back.' : 'Start with your name.'}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === 'signin' ? 'Sign in to pick up where your last field note left off.' : 'Create an account to keep your farm context and guidance together.'}</p>
        <div className="mt-7 flex rounded-full bg-secondary p-1"><button className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${mode === 'signin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} onClick={() => { setMode('signin'); setError(''); }} data-testid="button-auth-signin-tab">Sign in</button><button className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${mode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} onClick={() => { setMode('register'); setError(''); }} data-testid="button-auth-register-tab">Create account</button></div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' && <><div className="field"><label htmlFor="auth-name">Your name</label><input id="auth-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="How should we address you?" required maxLength={100} data-testid="input-auth-name" /></div><div className="field"><label htmlFor="auth-role">I work as</label><select id="auth-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="select-auth-role"><option value="farmer">Farmer</option><option value="agronomist">Agronomist</option><option value="extension_worker">Extension worker</option></select></div></>}
          <div className="field"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@farm.org" autoComplete="email" required data-testid="input-auth-email" /></div>
          <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required data-testid="input-auth-password" /></div>
          {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive" data-testid="text-auth-error">{error}</div>}
          <button className="btn btn-primary mt-2 w-full py-3" type="submit" disabled={pending} data-testid="button-auth-submit">{pending ? <LoaderCircle className="animate-spin" size={16} /> : mode === 'signin' ? 'Sign in' : 'Create my account'}{!pending && <ArrowRight size={15} />}</button>
        </form>
        <div className="mt-6 flex items-start gap-2 rounded-xl bg-[hsl(var(--accent)/.35)] p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />Your farm information stays tied to your account. AI outputs are advisory—not a replacement for local expertise.</div>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" data-testid="link-auth-back"><ArrowLeft size={13} /> Back to field desk</Link>
      </div>
    </div>
  </div>;
}

function NewAdvisoryPage() {
  const [, setLocation] = useLocation();
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const create = useCreateAdvisory();
  const qc = useQueryClient();
  const [form, setForm] = useState({ crop: '', region: '', country: '', season: 'Main season', areaHa: '', soilType: '', soilPH: '', nitrogen: '', phosphorus: '', potassium: '', organicCarbonPct: '', irrigation: '', budgetPerHa: '', currency: 'USD' });
  const seeded = useRef(false);
  useEffect(() => {
    if (profile.data && !seeded.current) {
      seeded.current = true;
      setForm((old) => ({ ...old, crop: profile.data?.crops?.[0] || '', region: profile.data?.region || '', country: profile.data?.country || '', areaHa: profile.data?.areaHa?.toString() || '', soilType: profile.data?.soilType || '', soilPH: profile.data?.soilPH?.toString() || '', nitrogen: profile.data?.nitrogen?.toString() || '', phosphorus: profile.data?.phosphorus?.toString() || '', potassium: profile.data?.potassium?.toString() || '', organicCarbonPct: profile.data?.organicCarbonPct?.toString() || '', irrigation: profile.data?.irrigation || '', budgetPerHa: profile.data?.budgetPerHa?.toString() || '', currency: profile.data?.currency || 'USD' }));
    }
  }, [profile.data]);
  const change = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { crop: form.crop, region: form.region, country: form.country, season: form.season, areaHa: Number(form.areaHa), soilType: form.soilType || null, soilPH: numericOrNull(form.soilPH), nitrogen: numericOrNull(form.nitrogen), phosphorus: numericOrNull(form.phosphorus), potassium: numericOrNull(form.potassium), organicCarbonPct: numericOrNull(form.organicCarbonPct), irrigation: form.irrigation, budgetPerHa: numericOrNull(form.budgetPerHa), currency: form.currency.toUpperCase() } }, {
      onSuccess: (item) => { void qc.invalidateQueries({ queryKey: getListAdvisoriesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setLocation(`/advisory/${item.id}`); },
    });
  };
  const profileShort = profile.data ? `${profile.data.farmName} · ${profile.data.region}` : 'No saved farm profile';
  return <div className="page-enter">
    <PageHeading kicker="SEASONAL PLANNING / NEW" title="A plan for this season." description="Bring your crop, field conditions and budget together. AgriVision will create a saved plan and show the assumptions behind it." />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--accent)/.55)] text-primary"><MapPin size={16} /></div><div><div className="text-xs font-semibold">Farm details as a starting point</div><div className="mt-0.5 text-xs text-muted-foreground">{profileShort}</div></div></div><Link href="/profile" className="text-xs font-semibold text-primary hover:underline" data-testid="link-advisory-profile">Edit farm profile <ArrowRight className="ml-1 inline" size={13} /></Link></div>
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">01</span><div><h2 className="font-semibold">Crop & season</h2><p className="text-xs text-muted-foreground">What are you preparing to grow?</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="adv-crop">Crop *</label><input id="adv-crop" value={form.crop} onChange={change('crop')} placeholder="e.g. maize" required maxLength={80} data-testid="input-advisory-crop" /></div><div className="field"><label htmlFor="adv-season">Season *</label><input id="adv-season" value={form.season} onChange={change('season')} placeholder="e.g. Long rains 2025" required maxLength={80} data-testid="input-advisory-season" /></div><div className="field"><label htmlFor="adv-area">Planted area (ha) *</label><input id="adv-area" type="number" min="0" step="0.01" value={form.areaHa} onChange={change('areaHa')} placeholder="0.0" required data-testid="input-advisory-area" /></div><div className="field"><label htmlFor="adv-irrigation">Water access *</label><select id="adv-irrigation" value={form.irrigation} onChange={change('irrigation')} required data-testid="select-advisory-irrigation"><option value="">Choose irrigation access</option><option>Rain-fed</option><option>Drip irrigation</option><option>Sprinkler irrigation</option><option>Flood irrigation</option><option>Mixed / supplemental</option></select></div></div>
        </section>
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">02</span><div><h2 className="font-semibold">Where it will grow</h2><p className="text-xs text-muted-foreground">Recommendations are more useful with local context.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="adv-region">Region *</label><input id="adv-region" value={form.region} onChange={change('region')} placeholder="District, county or region" required maxLength={160} data-testid="input-advisory-region" /></div><div className="field"><label htmlFor="adv-country">Country *</label><input id="adv-country" value={form.country} onChange={change('country')} placeholder="Country" required maxLength={120} data-testid="input-advisory-country" /></div><div className="field"><label htmlFor="adv-soiltype">Soil type</label><input id="adv-soiltype" value={form.soilType} onChange={change('soilType')} placeholder="e.g. sandy loam" data-testid="input-advisory-soil" /></div><div className="field"><label htmlFor="adv-ph">Soil pH</label><input id="adv-ph" type="number" min="0" max="14" step="0.1" value={form.soilPH} onChange={change('soilPH')} placeholder="Optional" data-testid="input-advisory-ph" /></div></div>
        </section>
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><span className="mono text-xs text-primary">03</span><div><h2 className="font-semibold">Soil nutrients & investment</h2><p className="text-xs text-muted-foreground">Leave unknowns blank; the report will label its assumptions.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-3"><div className="field"><label htmlFor="adv-n">Nitrogen</label><input id="adv-n" type="number" min="0" value={form.nitrogen} onChange={change('nitrogen')} placeholder="kg/ha or test value" data-testid="input-advisory-nitrogen" /></div><div className="field"><label htmlFor="adv-p">Phosphorus</label><input id="adv-p" type="number" min="0" value={form.phosphorus} onChange={change('phosphorus')} placeholder="kg/ha or test value" data-testid="input-advisory-phosphorus" /></div><div className="field"><label htmlFor="adv-k">Potassium</label><input id="adv-k" type="number" min="0" value={form.potassium} onChange={change('potassium')} placeholder="kg/ha or test value" data-testid="input-advisory-potassium" /></div><div className="field"><label htmlFor="adv-carbon">Organic carbon (%)</label><input id="adv-carbon" type="number" min="0" max="100" step="0.1" value={form.organicCarbonPct} onChange={change('organicCarbonPct')} placeholder="Optional" data-testid="input-advisory-carbon" /></div><div className="field"><label htmlFor="adv-budget">Budget / ha</label><input id="adv-budget" type="number" min="0" step="0.01" value={form.budgetPerHa} onChange={change('budgetPerHa')} placeholder="Optional" data-testid="input-advisory-budget" /></div><div className="field"><label htmlFor="adv-currency">Currency</label><input id="adv-currency" value={form.currency} onChange={change('currency')} maxLength={3} minLength={3} required data-testid="input-advisory-currency" /></div></div>
        </section>
        {create.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" data-testid="text-advisory-error">{create.error instanceof Error ? create.error.message : 'Could not generate this crop plan. Check your connection and try again.'}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="btn btn-quiet" data-testid="button-cancel-advisory"><ArrowLeft size={14} /> Cancel</Link><button className="btn btn-primary min-w-48" type="submit" disabled={create.isPending} data-testid="button-submit-advisory">{create.isPending ? <><LoaderCircle size={16} className="animate-spin" /> Building your plan…</> : <>Generate seasonal plan <ArrowRight size={15} /></>}</button></div>
      </div>
      <aside className="h-fit space-y-4">
        <div className="card bg-[hsl(var(--accent)/.34)] p-5"><div className="flex items-center gap-2 text-primary"><ShieldCheck size={17} /><span className="eyebrow">CLEARLY LABELED</span></div><h3 className="serif mt-3 text-2xl">A guide, not a guess.</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Your saved report separates crop actions, nutrient timing, disease risks, assumptions and confidence.</p></div>
        <div className="card p-5"><div className="eyebrow text-muted-foreground">BEFORE YOU GENERATE</div><ul className="mt-4 space-y-3 text-xs leading-5 text-muted-foreground">{['Confirm the farm region and planted area.', 'Add soil test values where you have them.', 'Use the budget you can actually invest.'].map((line, i) => <li className="flex gap-2" key={line}><span className="mono text-primary">0{i + 1}</span><span>{line}</span></li>)}</ul></div>
      </aside>
    </form>
  </div>;
}

function AdvisoryDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const item = useGetAdvisory(params.id || '', { query: { enabled: !!params.id, queryKey: getGetAdvisoryQueryKey(params.id || '') } });
  const remove = useDeleteAdvisory();
  const del = () => { if (params.id && window.confirm('Delete this saved crop plan?')) remove.mutate({ id: params.id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListAdvisoriesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setLocation('/history'); } }); };
  if (item.isLoading) return <LoadingBlock />;
  if (item.isError || !item.data) return <ErrorState title="Plan unavailable" detail="This plan may have been removed or is not available right now." onRetry={() => void item.refetch()} />;
  const { report } = item.data;
  return <div className="page-enter">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Link href="/history" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-history"><ArrowLeft size={14} /> All saved field notes</Link><button onClick={del} disabled={remove.isPending} className="btn btn-danger" data-testid="button-delete-advisory"><Trash2 size={14} /> Delete plan</button></div>
    <div className="rounded-[22px] bg-[hsl(var(--primary))] p-6 text-primary-foreground sm:p-9" data-testid={`data-advisory-${item.data.id}`}><div className="eyebrow text-primary-foreground/60">SEASONAL CROP PLAN / {fmtDate(item.data.createdAt)}</div><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><h1 className="serif text-5xl">{item.data.crop}</h1><div className="mt-2 flex items-center gap-2 text-sm text-primary-foreground/70"><MapPin size={14} />{item.data.region} <span>·</span>{item.data.season}</div></div><div className="rounded-xl border border-primary-foreground/20 px-4 py-3"><div className="eyebrow text-primary-foreground/55">AI CONFIDENCE</div><div className="mt-1 font-semibold">{titleCase(report.confidence)}</div></div></div><p className="mt-7 max-w-4xl border-t border-primary-foreground/15 pt-5 text-sm leading-7 text-primary-foreground/85">{report.overview}</p></div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="card p-5 sm:p-7"><div className="eyebrow text-primary">FIELD SEQUENCE / 01</div><h2 className="serif mt-2 text-3xl">Crop plan</h2><div className="mt-5 space-y-0">{report.cropPlan.map((step, i) => <div className="grid grid-cols-[30px_1fr] gap-3 border-t border-border py-4" key={`${step.stage}-${i}`}><div className="mono pt-1 text-xs text-primary">{String(i + 1).padStart(2, '0')}</div><div><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{step.stage}</h3><span className="status-pill bg-secondary text-secondary-foreground">{step.timing}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.action}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-background p-3"><div className="eyebrow text-muted-foreground">MATERIALS / AMOUNT</div><div className="mt-1 text-xs leading-5">{step.materials} · {step.amount}</div></div><div className="rounded-xl bg-[hsl(var(--chart-3)/.12)] p-3"><div className="eyebrow text-muted-foreground">CAUTION</div><div className="mt-1 text-xs leading-5">{step.caution || 'Follow local label directions.'}</div></div></div></div></div>)}</div></section>
      <div className="space-y-5">
        <section className="card p-5 sm:p-6"><div className="eyebrow text-primary">NUTRIENT PLAN / 02</div><h2 className="serif mt-2 text-2xl">Feed with purpose</h2><div className="mt-4 space-y-3">{report.nutrientPlan.map((nutrient, i) => <div key={`${nutrient.nutrient}-${i}`} className="border-t border-border pt-3"><div className="flex items-start justify-between gap-2"><b className="text-sm">{nutrient.nutrient}</b><span className="mono text-[10px] text-muted-foreground">{nutrient.timing}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{nutrient.recommendation}</p><p className="mt-1 text-[10px] text-muted-foreground">Basis: {nutrient.basis}</p></div>)}</div></section>
        <section className="card p-5 sm:p-6"><div className="eyebrow text-primary">DISEASE WATCH / 03</div><h2 className="serif mt-2 text-2xl">Signals to watch</h2><div className="mt-4 space-y-3">{report.diseaseRisks.map((risk, i) => <div key={`${risk.concern}-${i}`} className="rounded-xl bg-background p-3"><div className="flex items-start justify-between gap-2"><b className="text-sm">{risk.concern}</b><span className={`status-pill ${risk.likelihood === 'high' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>{risk.likelihood}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{risk.signals}</p><p className="mt-2 text-xs leading-5"><b>Prevention:</b> {risk.prevention}</p></div>)}</div></section>
      </div>
    </div>
    <section className="mt-5 grid gap-5 lg:grid-cols-[.95fr_1.05fr]">
      <div className="rounded-[20px] bg-[hsl(var(--accent)/.45)] p-6" data-testid="data-advisory-roi"><div className="eyebrow text-primary">ROI PROJECTION / 04</div><div className="mt-1 flex flex-wrap items-end justify-between gap-4"><div><div className="serif text-4xl">{fmtMoney(report.roi.estimatedNet, 'USD')}</div><div className="mt-1 text-sm text-muted-foreground">Estimated net return</div></div><div className="text-right"><div className="eyebrow text-muted-foreground">BREAK-EVEN</div><div className="mono mt-1 text-lg">{fmtMoney(report.roi.breakEvenPrice, 'USD')} / {report.roi.yieldUnit}</div></div></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-primary/15 pt-4"><div><div className="eyebrow text-muted-foreground">YIELD</div><div className="mt-1 text-sm font-semibold">{report.roi.estimatedYield} {report.roi.yieldUnit}</div></div><div><div className="eyebrow text-muted-foreground">REVENUE</div><div className="mt-1 text-sm font-semibold">{fmtMoney(report.roi.expectedRevenue)}</div></div><div><div className="eyebrow text-muted-foreground">COST</div><div className="mt-1 text-sm font-semibold">{fmtMoney(report.roi.estimatedCosts)}</div></div></div></div>
      <div className="card p-6"><div className="eyebrow text-muted-foreground">ASSUMPTIONS & LIMITS</div><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{[...report.assumptions, ...report.roi.assumptions].map((assumption, i) => <li key={`${assumption}-${i}`} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{assumption}</li>)}</ul><p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">{report.disclaimer}</p></div>
    </section>
  </div>;
}

function DiagnosisPage() {
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const diagnosis = useCreateDiagnosis();
  const qc = useQueryClient();
  const [crop, setCrop] = useState('');
  const [region, setRegion] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [preview, setPreview] = useState('');
  const [fileName, setFileName] = useState('');
  const [imageError, setImageError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const handleImage = (file?: File) => {
    setImageError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setImageError('Choose a JPG, PNG or WebP image.'); return; }
    if (file.size > 10 * 1024 * 1024) { setImageError('Image must be smaller than 10 MB.'); return; }
    setFileName(file.name);
    setPreview(URL.createObjectURL(file));
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (profile.data) { setRegion((current) => current || profile.data?.region || ''); setCrop((current) => current || profile.data?.crops?.[0] || ''); } }, [profile.data]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) { setImageError('Choose a crop photo before running a check.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setImageError('We could not read that image. Try another file.');
    reader.onload = () => {
      const imageData = String(reader.result).split(',')[1];
      diagnosis.mutate({ data: { crop: crop || null, region: region || null, symptoms: symptoms || null, mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp', imageData } }, {
        onSuccess: () => { void qc.invalidateQueries({ queryKey: getListDiagnosesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); void qc.invalidateQueries({ queryKey: getListDiagnosesQueryKey() }); },
      });
    };
    reader.readAsDataURL(file);
  };
  const list = useListDiagnoses({ query: { enabled: !!session.data?.authenticated, queryKey: getListDiagnosesQueryKey() } });
  const latest = list.data?.[0];
  return <div className="page-enter">
    <PageHeading kicker="CROP HEALTH / PHOTO CHECK" title="Look closer, sooner." description="Upload one clear leaf or plant image. AgriVision returns a likely issue, confidence, severity and practical next steps—not a definitive diagnosis." />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
      <form onSubmit={submit} className="space-y-5">
        <section className="card p-5 sm:p-7"><div className="mb-4 flex items-center justify-between"><div><div className="eyebrow text-primary">01 / ADD A PHOTO</div><h2 className="serif mt-2 text-2xl">What does the plant show?</h2></div><Camera className="text-primary" size={21} /></div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => handleImage(e.target.files?.[0])} data-testid="input-diagnosis-image" />
          <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleImage(e.dataTransfer.files[0]); }} className={`group flex min-h-[260px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed text-center transition ${preview ? 'border-primary/40 bg-background p-3' : 'border-border bg-background px-5 py-12 hover:border-primary/50 hover:bg-[hsl(var(--accent)/.2)]'}`} data-testid="button-upload-diagnosis">
            {preview ? <><img src={preview} alt="Selected crop sample" className="max-h-[300px] w-full rounded-xl object-contain" /><span className="mt-3 text-xs text-muted-foreground">{fileName} · Select a different photo</span></> : <><div className="grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--accent)/.5)] text-primary transition group-hover:scale-105"><Upload size={22} /></div><div className="mt-4 font-semibold">Drop a field photo, or browse files</div><div className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP · up to 10 MB</div><div className="mt-4 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">Choose photo</div></>}
          </button>
          {imageError && <div role="alert" className="mt-3 text-xs text-destructive" data-testid="text-image-error">{imageError}</div>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="diag-crop">Crop (optional)</label><input id="diag-crop" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="e.g. tomato" data-testid="input-diagnosis-crop" /></div><div className="field"><label htmlFor="diag-region">Region (optional)</label><input id="diag-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Your farm region" data-testid="input-diagnosis-region" /></div><div className="field sm:col-span-2"><label htmlFor="diag-symptoms">What have you noticed?</label><textarea id="diag-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} maxLength={1000} placeholder="Where it started, how quickly it changed, recent weather or treatments…" data-testid="input-diagnosis-symptoms" /></div></div>
        </section>
        {diagnosis.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" data-testid="text-diagnosis-error">{diagnosis.error instanceof Error ? diagnosis.error.message : 'Photo analysis could not be completed. Please retry.'}</div>}
        <button type="submit" disabled={diagnosis.isPending} className="btn btn-primary w-full py-3.5 sm:w-auto sm:min-w-56" data-testid="button-submit-diagnosis">{diagnosis.isPending ? <><LoaderCircle size={16} className="animate-spin" /> Reading image…</> : <>Run photo check <ArrowRight size={15} /></>}</button>
      </form>
      <aside className="space-y-5">
        <div className="card p-5 sm:p-6"><div className="eyebrow text-primary">GET A CLEARER READ</div><ul className="mt-4 space-y-4">{[['Frame the affected area', 'Include healthy tissue for comparison.'], ['Use natural light', 'Avoid strong shadows, flash and filters.'], ['Send context too', 'Symptoms and recent weather can change interpretation.']].map(([head, copy], i) => <li key={head} className="flex gap-3"><span className="mono pt-0.5 text-xs text-primary">0{i + 1}</span><div><b className="text-sm">{head}</b><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p></div></li>)}</ul></div>
        <div className="rounded-2xl border border-[hsl(var(--chart-3)/.28)] bg-[hsl(var(--chart-3)/.11)] p-5"><div className="flex items-center gap-2 text-[hsl(var(--chart-3))]"><ShieldCheck size={16} /><span className="eyebrow">AI GUIDANCE</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">A photo check is a first assessment. Confirm high-severity concerns with a local agronomist before applying treatment.</p></div>
        <div><div className="mb-3 flex items-center justify-between"><div><div className="eyebrow text-muted-foreground">SAVED CHECKS</div><h2 className="serif mt-1 text-2xl">Recent diagnoses</h2></div><Link href="/history" className="text-xs font-semibold text-primary" data-testid="link-diagnosis-history">View all</Link></div>
          {list.isLoading ? <Skeleton className="h-20" /> : list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : latest ? <DiagnosisCard item={latest} /> : <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs leading-5 text-muted-foreground" data-testid="state-no-diagnoses">Your saved photo checks will appear here.</div>}
        </div>
      </aside>
    </div>
  </div>;
}

function DiagnosisDetailPage() {
  const params = useParams<{ id: string }>();
  const item = useGetDiagnosis(params.id || '', { query: { enabled: !!params.id, queryKey: getGetDiagnosisQueryKey(params.id || '') } });
  const remove = useDeleteDiagnosis();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const onDelete = () => { if (params.id && window.confirm('Delete this saved diagnosis?')) remove.mutate({ id: params.id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListDiagnosesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setLocation('/history'); } }); };
  if (item.isLoading) return <LoadingBlock />;
  if (item.isError || !item.data) return <ErrorState title="Diagnosis unavailable" onRetry={() => void item.refetch()} />;
  const report = item.data.report;
  return <div className="page-enter">
    <div className="mb-6 flex justify-between"><Link href="/history" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground" data-testid="link-back-diagnoses"><ArrowLeft size={14} /> Field history</Link><button onClick={onDelete} className="btn btn-danger" disabled={remove.isPending} data-testid="button-delete-diagnosis"><Trash2 size={14} /> Delete check</button></div>
    <div className="rounded-[22px] bg-[hsl(var(--primary))] p-6 text-primary-foreground sm:p-9" data-testid={`data-diagnosis-${item.data.id}`}><div className="eyebrow text-primary-foreground/60">PHOTO CHECK / {fmtDate(item.data.createdAt)}</div><h1 className="serif mt-3 text-4xl sm:text-5xl">{report.likelyIssue}</h1><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs">{item.data.crop || 'Crop not specified'}</span><span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs">{item.data.region || 'Region not specified'}</span><span className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs">Severity {report.severity}/5</span></div></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <section className="card p-6"><div className="eyebrow text-primary">OBSERVED / CONFIDENCE: {titleCase(report.confidence)}</div><h2 className="serif mt-2 text-2xl">What stood out</h2><ul className="mt-4 space-y-2">{report.observations.map((line, i) => <li className="flex gap-2 text-sm leading-6" key={`${line}-${i}`}><Check size={15} className="mt-1 shrink-0 text-primary" />{line}</li>)}</ul><div className="mt-5 border-t border-border pt-4"><div className="eyebrow text-muted-foreground">POSSIBLE CAUSES</div><ul className="mt-2 space-y-2">{report.possibleCauses.map((line, i) => <li key={`${line}-${i}`} className="text-sm text-muted-foreground">· {line}</li>)}</ul></div></section>
      <section className="card p-6"><div className="eyebrow text-primary">NEXT STEPS</div><h2 className="serif mt-2 text-2xl">Actions to consider</h2><div className="mt-4 space-y-3">{report.actions.map((action, i) => <div key={`${action.type}-${i}`} className="rounded-xl bg-background p-4"><div className="flex justify-between gap-3"><b className="text-sm">{titleCase(action.type)}</b><span className="mono text-[10px] text-muted-foreground">{action.timing}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{action.action}</p>{action.caution && <p className="mt-2 text-xs leading-5 text-[hsl(var(--chart-3))]">Caution: {action.caution}</p>}</div>)}</div></section>
      <div className="rounded-2xl bg-[hsl(var(--chart-3)/.14)] p-5"><div className="eyebrow text-[hsl(var(--chart-3))]">ESCALATION GUIDANCE</div><p className="mt-2 text-sm leading-6">{report.escalation}</p></div><div className="card p-5"><div className="eyebrow text-muted-foreground">IMPORTANT</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{report.disclaimer}</p></div>
    </div>
  </div>;
}

function MarketPage() {
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const [crop, setCrop] = useState('');
  const [region, setRegion] = useState('');
  const [form, setForm] = useState({ crop: '', region: '', market: '', unit: 'kg', currency: 'USD', price: '', observedAt: new Date().toISOString().slice(0,16), source: '' });
  const [roi, setRoi] = useState({ yield: '', cost: '' });
  const qc = useQueryClient();
  const records = useListMarketObservations({ crop: crop || undefined, region: region || undefined }, { query: { enabled: !!session.data?.authenticated, queryKey: getListMarketObservationsQueryKey({ crop: crop || undefined, region: region || undefined }) } });
  const summary = useGetMarketSummary({ crop: crop || form.crop || profile.data?.crops?.[0] || 'maize', region: region || profile.data?.region }, { query: { enabled: !!session.data?.authenticated && !!(crop || form.crop || profile.data?.crops?.[0]), queryKey: getGetMarketSummaryQueryKey({ crop: crop || form.crop || profile.data?.crops?.[0] || 'maize', region: region || profile.data?.region }) } });
  const create = useCreateMarketObservation();
  const remove = useDeleteMarketObservation();
  useEffect(() => { if (profile.data) { setCrop((old) => old || profile.data?.crops?.[0] || ''); setRegion((old) => old || profile.data?.region || ''); setForm((old) => ({ ...old, crop: old.crop || profile.data?.crops?.[0] || '', region: old.region || profile.data?.region || '', currency: old.currency === 'USD' ? profile.data?.currency || 'USD' : old.currency })); } }, [profile.data]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { crop: form.crop, region: form.region, market: form.market, unit: form.unit, currency: form.currency.toUpperCase(), price: Number(form.price), observedAt: new Date(form.observedAt).toISOString(), source: form.source || null } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListMarketObservationsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetMarketSummaryQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setForm((old) => ({ ...old, price: '', source: '' })); } });
  };
  const deleteObservation = (id: string) => { if (window.confirm('Remove this market observation?')) remove.mutate({ id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListMarketObservationsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetMarketSummaryQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); };
  const estimatedRevenue = Number(roi.yield || 0) * (summary.data?.latestPrice ?? 0);
  const net = estimatedRevenue - Number(roi.cost || 0);
  const changePct = summary.data?.changePct;
  return <div className="page-enter">
    <PageHeading kicker="LOCAL PRICES / FIELD ECONOMICS" title="Know the price. Know your margin." description="Keep a record of what you observed at market. Use local notes—not a generic forecast—to think through the return on your crop." />
    <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <section className="rounded-[22px] bg-[hsl(var(--primary))] p-6 text-primary-foreground sm:p-8" data-testid="card-market-summary"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow text-primary-foreground/60">LATEST OBSERVATION / {summary.data?.crop || crop || 'CROP'}</div><div className="serif mt-3 text-5xl">{summary.isLoading ? '—' : fmtMoney(summary.data?.latestPrice, summary.data?.currency || form.currency)}</div><div className="mt-2 flex items-center gap-2 text-sm text-primary-foreground/70"><MapPin size={14} />{summary.data?.region || region || 'Choose a region'}{summary.data?.unit && ` · / ${summary.data.unit}`}</div></div><div className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${changePct == null ? 'bg-primary-foreground/10' : changePct >= 0 ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-red-100 text-red-800'}`}>{changePct == null ? 'No change data' : <>{changePct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{changePct > 0 ? '+' : ''}{changePct.toFixed(1)}% vs prior</>}</div></div><div className="mt-7 flex flex-wrap gap-3 border-t border-primary-foreground/15 pt-4"><div className="flex items-center gap-2"><label className="eyebrow text-primary-foreground/55" htmlFor="market-crop-filter">Crop</label><input id="market-crop-filter" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="All crops" className="w-32 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2 text-xs text-primary-foreground placeholder:text-primary-foreground/45 focus:outline-none" data-testid="input-market-filter-crop" /></div><div className="flex items-center gap-2"><label className="eyebrow text-primary-foreground/55" htmlFor="market-region-filter">Region</label><input id="market-region-filter" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" className="w-36 rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2 text-xs text-primary-foreground placeholder:text-primary-foreground/45 focus:outline-none" data-testid="input-market-filter-region" /></div></div>
      </section>
      <section className="card flex flex-col justify-between p-5 sm:p-6"><div><div className="eyebrow text-primary">FIELD ROI / QUICK SCENARIO</div><h2 className="serif mt-2 text-2xl">A rough margin, using this price.</h2><p className="mt-1 text-xs text-muted-foreground">Not a yield promise. Your inputs, your assumptions.</p></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="field"><label htmlFor="roi-yield">Expected yield ({summary.data?.unit || form.unit})</label><input id="roi-yield" type="number" min="0" step=".01" value={roi.yield} onChange={(e) => setRoi({ ...roi, yield: e.target.value })} placeholder="e.g. 2400" data-testid="input-roi-yield" /></div><div className="field"><label htmlFor="roi-cost">Total costs ({summary.data?.currency || form.currency})</label><input id="roi-cost" type="number" min="0" step=".01" value={roi.cost} onChange={(e) => setRoi({ ...roi, cost: e.target.value })} placeholder="e.g. 840" data-testid="input-roi-cost" /></div></div><div className="mt-4 flex items-end justify-between rounded-xl bg-[hsl(var(--accent)/.45)] p-4"><div><div className="eyebrow text-muted-foreground">ESTIMATED NET</div><div className="serif mt-1 text-3xl" data-testid="data-roi-net">{fmtMoney(net, summary.data?.currency || form.currency)}</div></div><div className="text-right text-[10px] leading-4 text-muted-foreground">{fmtMoney(estimatedRevenue, summary.data?.currency || form.currency)} gross<br />minus costs</div></div></section>
    </div>
    <div className="mt-7 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <section className="card p-5 sm:p-6"><div className="eyebrow text-primary">RECORD A PRICE / YOUR OBSERVATION</div><h2 className="serif mt-2 text-2xl">Add a market note</h2><form onSubmit={submit} className="mt-5 space-y-3">
        <div className="grid grid-cols-2 gap-3"><div className="field"><label htmlFor="obs-crop">Crop *</label><input id="obs-crop" value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} required data-testid="input-observation-crop" /></div><div className="field"><label htmlFor="obs-market">Market *</label><input id="obs-market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} placeholder="Market name" required data-testid="input-observation-market" /></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="field"><label htmlFor="obs-price">Price *</label><input id="obs-price" type="number" min="0" step=".01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required data-testid="input-observation-price" /></div><div className="field"><label htmlFor="obs-unit">Unit *</label><input id="obs-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required placeholder="kg, bag, crate" data-testid="input-observation-unit" /></div></div>
        <div className="grid grid-cols-2 gap-3"><div className="field"><label htmlFor="obs-region">Region *</label><input id="obs-region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} required data-testid="input-observation-region" /></div><div className="field"><label htmlFor="obs-currency">Currency *</label><input id="obs-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} minLength={3} required data-testid="input-observation-currency" /></div></div>
        <div className="field"><label htmlFor="obs-time">Observed at *</label><input id="obs-time" type="datetime-local" value={form.observedAt} onChange={(e) => setForm({ ...form, observedAt: e.target.value })} required data-testid="input-observation-time" /></div>
        <div className="field"><label htmlFor="obs-source">Source (optional)</label><input id="obs-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Trader, cooperative, market board…" data-testid="input-observation-source" /></div>
        {create.isError && <p role="alert" className="text-xs text-destructive" data-testid="text-market-error">{create.error instanceof Error ? create.error.message : 'Could not save the market note.'}</p>}
        <button disabled={create.isPending} className="btn btn-primary mt-2 w-full" type="submit" data-testid="button-save-observation">{create.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Save market observation</button>
      </form></section>
      <section><div className="mb-4 flex items-end justify-between"><div><div className="eyebrow text-muted-foreground">PERSONAL FIELD RECORD / {records.data?.length ?? '—'} ENTRIES</div><h2 className="serif mt-1 text-2xl">Price observations</h2></div><div className="mono hidden text-[10px] text-muted-foreground sm:block">RECORDED, NOT PREDICTED</div></div>
        {records.isLoading ? <LoadingBlock /> : records.isError ? <ErrorState onRetry={() => void records.refetch()} /> : records.data?.length ? <div className="card overflow-hidden">{records.data.map((row, i) => <div key={row.id} data-testid={`row-observation-${row.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5 ${i ? 'border-t border-border' : ''}`}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--chart-3)/.17)] text-[hsl(var(--chart-3))]"><TrendingUp size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{row.crop}</b><span className="text-xs text-muted-foreground">{row.market}</span></div><div className="mt-1 text-xs text-muted-foreground">{row.region} · {fmtDate(row.observedAt)} {row.source ? `· ${row.source}` : ''}</div></div><div className="text-right"><div className="mono text-sm font-semibold">{fmtMoney(row.price, row.currency)}<span className="text-muted-foreground"> / {row.unit}</span></div><button onClick={() => deleteObservation(row.id)} disabled={remove.isPending} className="mt-1 text-[10px] text-muted-foreground hover:text-destructive" data-testid={`button-delete-observation-${row.id}`}>Remove</button></div></div>)}</div> : <EmptyState icon={TrendingUp} title="No market notes recorded" detail="Add prices you personally observed to build a useful local comparison." />}
      </section>
    </div>
    <div className="mt-6 flex gap-3 rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" /><span>Price records reflect observations entered by you. They are not live exchange data, and returns depend on actual yield, quality, costs and timing.</span></div>
  </div>;
}

function ChatPage() {
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const conversations = useListConversations({ query: { enabled: !!session.data?.authenticated, queryKey: getListConversationsQueryKey() } });
  const [activeId, setActiveId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const detail = useGetConversation(activeId, { query: { enabled: !!activeId, queryKey: getGetConversationQueryKey(activeId) } });
  const create = useCreateConversation();
  const send = useSendConversationMessage();
  const remove = useDeleteConversation();
  const qc = useQueryClient();
  useEffect(() => { if (!activeId && conversations.data?.length) setActiveId(conversations.data[0].id); }, [activeId, conversations.data]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setError(''); setMessage('');
    try {
      let id = activeId;
      if (!id) {
        const conv = await create.mutateAsync({ data: { title: text.slice(0, 54) } });
        id = conv.id; setActiveId(id);
      }
      await send.mutateAsync({ id, data: { message: text } });
      void qc.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } catch (e) {
      setMessage(text);
      setError(e instanceof Error ? e.message : 'Message could not be sent. Please try again.');
    }
  };
  const newChat = () => { setActiveId(''); setMessage(''); setError(''); };
  const deleteConversation = (id: string) => { if (window.confirm('Delete this conversation and its saved messages?')) remove.mutate({ id }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setActiveId(''); } }); };
  const pending = create.isPending || send.isPending;
  const greetings = ['What should I watch for in my crop this week?', 'Help me understand these soil test results.', 'How can I reduce water stress in my field?'];
  return <div className="page-enter">
    <PageHeading kicker="FIELD Q&A / AGRIBOT" title="Ask the field companion." description="A practical conversation grounded in your farm details. Replies are AI-generated guidance; ask for the reasoning and verify recommendations locally." action={<button onClick={newChat} className="btn btn-primary" data-testid="button-new-conversation"><Plus size={15} /> New conversation</button>} />
    <div className="grid min-h-[560px] overflow-hidden rounded-[22px] border border-border bg-card shadow-sm lg:grid-cols-[280px_1fr]">
      <aside className="flex max-h-[260px] flex-col border-b border-border bg-background/75 lg:max-h-none lg:border-b-0 lg:border-r"><div className="flex items-center justify-between border-b border-border px-4 py-4"><div className="eyebrow text-muted-foreground">SAVED CHATS</div><span className="mono text-[10px] text-muted-foreground">{conversations.data?.length ?? 0}</span></div>
        <div className="scrollbar-none flex-1 overflow-y-auto p-2">{conversations.isLoading ? <div className="space-y-2 p-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : conversations.isError ? <div className="p-3"><ErrorState title="Chats unavailable" onRetry={() => void conversations.refetch()} /></div> : conversations.data?.length ? conversations.data.map((chat) => <div key={chat.id} className={`group flex items-center gap-2 rounded-xl px-3 py-3 ${activeId === chat.id ? 'bg-[hsl(var(--accent)/.5)]' : 'hover:bg-muted/70'}`}><button onClick={() => setActiveId(chat.id)} className="min-w-0 flex-1 text-left" data-testid={`button-open-conversation-${chat.id}`}><div className="truncate text-xs font-semibold">{chat.title}</div><div className="mt-1 text-[10px] text-muted-foreground">{fmtDate(chat.updatedAt)}</div></button><button onClick={() => deleteConversation(chat.id)} className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label={`Delete ${chat.title}`} data-testid={`button-delete-conversation-${chat.id}`}><Trash2 size={13} /></button></div>) : <div className="p-5 text-center"><MessageSquare className="mx-auto text-muted-foreground/50" size={20} /><p className="mt-2 text-xs leading-5 text-muted-foreground">Your saved conversations will appear here.</p></div>}</div>
        <div className="border-t border-border p-3 text-[10px] leading-4 text-muted-foreground">Farm context: {profile.data ? `${profile.data.region} · ${profile.data.crops.join(', ') || 'No crops saved'}` : 'Not yet linked'}</div>
      </aside>
      <section className="flex min-h-[540px] flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--accent)/.52)] text-primary"><Sprout size={18} /></div><div className="flex-1"><div className="text-sm font-semibold">AgriBot</div><div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Farm-aware assistant · AI-generated</div></div><button onClick={() => void detail.refetch()} disabled={!activeId || detail.isFetching} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" title="Refresh conversation" data-testid="button-refresh-chat"><Activity size={15} /></button></div>
        <div className="scrollbar-none flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" data-testid="data-chat-messages">
          {!activeId ? <div className="mx-auto flex h-full max-w-lg flex-col justify-center py-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--accent)/.5)] text-primary"><Sprout size={25} /></div><h2 className="serif mt-5 text-3xl">Let's start with your field.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.data ? `${profile.data.farmName} · ${profile.data.region} · ${profile.data.crops.join(', ') || 'crops not listed'}` : 'Add farm details to make advice more specific.'}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{greetings.map((prompt) => <button key={prompt} onClick={() => setMessage(prompt)} className="rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary" data-testid={`button-chat-prompt-${greetings.indexOf(prompt)}`}>{prompt}</button>)}</div></div>
            : detail.isLoading ? <div className="space-y-4"><Skeleton className="h-20 w-3/4" /><Skeleton className="ml-auto h-16 w-2/3" /><Skeleton className="h-24 w-3/4" /></div>
            : detail.isError ? <ErrorState title="Could not open this conversation" onRetry={() => void detail.refetch()} />
            : detail.data?.messages.length ? detail.data.messages.map((msg) => <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} data-testid={`message-${msg.id}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[76%] ${msg.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-background'}`}><div className="mb-1 flex items-center gap-2"><span className={`eyebrow ${msg.role === 'user' ? 'text-primary-foreground/55' : 'text-primary'}`}>{msg.role === 'user' ? 'YOU' : 'AGRIBOT / AI'}</span><span className={`text-[9px] ${msg.role === 'user' ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(msg.createdAt))}</span></div><p className="whitespace-pre-wrap text-sm leading-6">{msg.content}</p></div></div>)
            : <div className="py-12 text-center text-sm text-muted-foreground">No messages in this conversation yet. Ask your first question below.</div>}
          {pending && <div className="flex"><div className="rounded-2xl rounded-bl-md bg-background px-4 py-3"><div className="eyebrow text-primary">AGRIBOT / THINKING</div><div className="mt-2 flex gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" /></div></div></div>}
        </div>
        <div className="border-t border-border p-4 sm:p-5"><div className="mb-2 flex items-center justify-between"><span className="eyebrow text-muted-foreground">ASK WITH YOUR FARM CONTEXT</span><span className="mono text-[10px] text-muted-foreground">{message.length}/5000</span></div>
          {error && <div role="alert" className="mb-2 flex items-center justify-between gap-3 text-xs text-destructive" data-testid="text-chat-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={13} /></button></div>}
          <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:border-primary"><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={5000} placeholder="Ask about planting, pests, soil, rainfall…" className="max-h-36 min-h-10 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/70" data-testid="input-chat-message" /><button type="submit" disabled={pending || !message.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send message" data-testid="button-send-chat"><Send size={16} /></button></form>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">AI responses can be incomplete. Verify safety-critical decisions with a qualified local adviser.</p>
        </div>
      </section>
    </div>
  </div>;
}

function HistoryPage() {
  const session = useGetSession();
  const advisories = useListAdvisories({ query: { enabled: !!session.data?.authenticated, queryKey: getListAdvisoriesQueryKey() } });
  const diagnoses = useListDiagnoses({ query: { enabled: !!session.data?.authenticated, queryKey: getListDiagnosesQueryKey() } });
  const [filter, setFilter] = useState('all');
  const isLoading = advisories.isLoading || diagnoses.isLoading;
  const isError = advisories.isError || diagnoses.isError;
  const allItems = useMemo(() => [
    ...(advisories.data || []).map((value) => ({ kind: 'plan' as const, date: value.createdAt, value })),
    ...(diagnoses.data || []).map((value) => ({ kind: 'diagnosis' as const, date: value.createdAt, value })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [advisories.data, diagnoses.data]);
  const filtered = allItems.filter((item) => filter === 'all' || item.kind === filter);
  return <div className="page-enter">
    <PageHeading kicker="SAVED FIELD NOTES / HISTORY" title="Your decisions, in one place." description="Return to a crop plan, revisit a diagnosis or remove records you no longer need." action={<Link href="/advisory/new" className="btn btn-primary" data-testid="button-history-new-plan"><Plus size={15} /> New crop plan</Link>} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-full bg-secondary p-1">{[['all','Everything'],['plan','Crop plans'],['diagnosis','Photo checks']].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${filter === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} data-testid={`button-history-filter-${key}`}>{label}</button>)}</div><div className="mono text-[10px] text-muted-foreground" data-testid="text-history-count">{isLoading ? '—' : `${filtered.length} SAVED NOTES`}</div></div>
    {isLoading ? <LoadingBlock /> : isError ? <ErrorState title="History could not load" detail="Try again to reload your saved plans and diagnoses." onRetry={() => { void advisories.refetch(); void diagnoses.refetch(); }} /> : filtered.length ? <div className="space-y-3">{filtered.map((item) => item.kind === 'plan' ? <AdvisoryCard item={item.value as Advisory} key={`plan-${item.value.id}`} /> : <DiagnosisCard item={item.value as Diagnosis} key={`diagnosis-${item.value.id}`} />)}</div> : <EmptyState icon={FileText} title={filter === 'all' ? 'Nothing saved here yet' : `No ${filter === 'plan' ? 'crop plans' : 'photo checks'} yet`} detail="Your completed crop plans and diagnoses will be saved here for easy reference." action={<Link href={filter === 'diagnosis' ? '/diagnose' : '/advisory/new'} className="btn btn-primary" data-testid="button-history-empty-action">{filter === 'diagnosis' ? 'Check a crop' : 'Build a crop plan'} <ArrowRight size={14} /></Link>} />}
  </div>;
}

function ProfilePage() {
  const session = useGetSession();
  const profile = useGetProfile({ query: { enabled: !!session.data?.authenticated, queryKey: getGetProfileQueryKey() } });
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState({ farmName: '', region: '', country: '', crops: '', areaHa: '', latitude: '', longitude: '', soilType: '', soilPH: '', nitrogen: '', phosphorus: '', potassium: '', organicCarbonPct: '', irrigation: '', budgetPerHa: '', currency: 'USD' });
  const initFor = useRef('');
  useEffect(() => {
    const data = profile.data;
    if (data && initFor.current !== `${data.farmName}-${data.region}`) {
      initFor.current = `${data.farmName}-${data.region}`;
      setForm({ farmName: data.farmName || '', region: data.region || '', country: data.country || '', crops: data.crops?.join(', ') || '', areaHa: data.areaHa?.toString() || '', latitude: data.latitude?.toString() || '', longitude: data.longitude?.toString() || '', soilType: data.soilType || '', soilPH: data.soilPH?.toString() || '', nitrogen: data.nitrogen?.toString() || '', phosphorus: data.phosphorus?.toString() || '', potassium: data.potassium?.toString() || '', organicCarbonPct: data.organicCarbonPct?.toString() || '', irrigation: data.irrigation || '', budgetPerHa: data.budgetPerHa?.toString() || '', currency: data.currency || 'USD' });
    }
  }, [profile.data]);
  const edit = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: FarmProfileInput = { farmName: form.farmName, region: form.region, country: form.country, crops: form.crops.split(',').map((crop) => crop.trim()).filter(Boolean), areaHa: numericOrNull(form.areaHa), latitude: numericOrNull(form.latitude), longitude: numericOrNull(form.longitude), soilType: form.soilType || null, soilPH: numericOrNull(form.soilPH), nitrogen: numericOrNull(form.nitrogen), phosphorus: numericOrNull(form.phosphorus), potassium: numericOrNull(form.potassium), organicCarbonPct: numericOrNull(form.organicCarbonPct), irrigation: form.irrigation || null, budgetPerHa: numericOrNull(form.budgetPerHa), currency: form.currency.toUpperCase() };
    update.mutate({ data: body }, { onSuccess: (data) => { qc.setQueryData(getGetProfileQueryKey(), data); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } });
  };
  if (profile.isLoading) return <LoadingBlock />;
  if (profile.isError && !profile.data) return <ErrorState title="Farm profile unavailable" detail="Sign in to create or update your farm profile." onRetry={() => void profile.refetch()} />;
  return <div className="page-enter">
    <PageHeading kicker="YOUR FARM / PROFILE" title="Start with the ground truth." description="These details help tailor crop plans, weather context and AgriBot responses. Unknown soil values can stay blank." />
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_310px]">
      <div className="space-y-5">
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--accent)/.55)] text-primary"><MapPin size={17} /></div><div><h2 className="font-semibold">Farm identity & location</h2><p className="text-xs text-muted-foreground">The basis for local guidance.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="profile-farm">Farm name *</label><input id="profile-farm" value={form.farmName} onChange={edit('farmName')} maxLength={120} required placeholder="e.g. Mwangaza Farm" data-testid="input-profile-farm-name" /></div><div className="field"><label htmlFor="profile-region">Region *</label><input id="profile-region" value={form.region} onChange={edit('region')} maxLength={120} required placeholder="District, county or region" data-testid="input-profile-region" /></div><div className="field"><label htmlFor="profile-country">Country *</label><input id="profile-country" value={form.country} onChange={edit('country')} maxLength={120} required placeholder="Country" data-testid="input-profile-country" /></div><div className="field"><label htmlFor="profile-area">Farm area (ha)</label><input id="profile-area" type="number" min="0" step=".01" value={form.areaHa} onChange={edit('areaHa')} placeholder="Optional" data-testid="input-profile-area" /></div><div className="field sm:col-span-2"><label htmlFor="profile-crops">Crops grown</label><input id="profile-crops" value={form.crops} onChange={edit('crops')} placeholder="Separate crops with commas, e.g. maize, beans" data-testid="input-profile-crops" /></div></div></section>
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--chart-4)/.16)] text-[hsl(var(--chart-4))]"><Droplets size={17} /></div><div><h2 className="font-semibold">Soil & water</h2><p className="text-xs text-muted-foreground">Use a recent soil test where available.</p></div></div><div className="grid gap-4 sm:grid-cols-3"><div className="field sm:col-span-2"><label htmlFor="profile-soil-type">Soil type</label><input id="profile-soil-type" value={form.soilType} onChange={edit('soilType')} placeholder="e.g. clay loam" data-testid="input-profile-soil-type" /></div><div className="field"><label htmlFor="profile-ph">Soil pH</label><input id="profile-ph" type="number" min="0" max="14" step=".1" value={form.soilPH} onChange={edit('soilPH')} placeholder="Optional" data-testid="input-profile-soil-ph" /></div><div className="field"><label htmlFor="profile-n">Nitrogen</label><input id="profile-n" type="number" min="0" value={form.nitrogen} onChange={edit('nitrogen')} data-testid="input-profile-nitrogen" /></div><div className="field"><label htmlFor="profile-p">Phosphorus</label><input id="profile-p" type="number" min="0" value={form.phosphorus} onChange={edit('phosphorus')} data-testid="input-profile-phosphorus" /></div><div className="field"><label htmlFor="profile-k">Potassium</label><input id="profile-k" type="number" min="0" value={form.potassium} onChange={edit('potassium')} data-testid="input-profile-potassium" /></div><div className="field"><label htmlFor="profile-carbon">Organic carbon (%)</label><input id="profile-carbon" type="number" min="0" max="100" step=".1" value={form.organicCarbonPct} onChange={edit('organicCarbonPct')} data-testid="input-profile-organic-carbon" /></div><div className="field sm:col-span-2"><label htmlFor="profile-irrigation">Irrigation access</label><select id="profile-irrigation" value={form.irrigation} onChange={edit('irrigation')} data-testid="select-profile-irrigation"><option value="">Not specified</option><option>Rain-fed</option><option>Drip irrigation</option><option>Sprinkler irrigation</option><option>Flood irrigation</option><option>Mixed / supplemental</option></select></div></div></section>
        <section className="card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--chart-3)/.17)] text-[hsl(var(--chart-3))]"><TrendingUp size={17} /></div><div><h2 className="font-semibold">Planning & forecast location</h2><p className="text-xs text-muted-foreground">Coordinates provide farm-specific weather.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="field"><label htmlFor="profile-lat">Latitude</label><input id="profile-lat" type="number" min="-90" max="90" step=".00001" value={form.latitude} onChange={edit('latitude')} placeholder="e.g. -1.2864" data-testid="input-profile-latitude" /></div><div className="field"><label htmlFor="profile-lng">Longitude</label><input id="profile-lng" type="number" min="-180" max="180" step=".00001" value={form.longitude} onChange={edit('longitude')} placeholder="e.g. 36.8172" data-testid="input-profile-longitude" /></div><div className="field"><label htmlFor="profile-budget">Typical budget / ha</label><input id="profile-budget" type="number" min="0" value={form.budgetPerHa} onChange={edit('budgetPerHa')} placeholder="Optional" data-testid="input-profile-budget" /></div><div className="field"><label htmlFor="profile-currency">Currency code</label><input id="profile-currency" value={form.currency} onChange={edit('currency')} minLength={3} maxLength={3} required data-testid="input-profile-currency" /></div></div></section>
        {update.isError && <div role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive" data-testid="text-profile-error">{update.error instanceof Error ? update.error.message : 'Farm profile could not be saved.'}</div>}
        {update.isSuccess && <div role="status" className="flex items-center gap-2 rounded-xl bg-[hsl(var(--accent)/.45)] p-3 text-sm text-primary" data-testid="text-profile-saved"><Check size={16} /> Farm details saved. Future guidance will use this context.</div>}
        <button type="submit" disabled={update.isPending} className="btn btn-primary min-w-48" data-testid="button-save-profile">{update.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Save farm profile</button>
      </div>
      <aside className="space-y-4"><div className="card bg-[hsl(var(--accent)/.32)] p-5"><div className="eyebrow text-primary">PROFILE COMPLETENESS</div><div className="serif mt-2 text-3xl">{profile.data ? `${[profile.data.farmName, profile.data.region, profile.data.country, profile.data.crops.length > 0, profile.data.areaHa != null, profile.data.soilType, profile.data.latitude != null].filter(Boolean).length}/7` : '0/7'}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">A little more context helps keep recommendations grounded in your actual farm.</p></div><div className="card p-5"><div className="eyebrow text-muted-foreground">ACCOUNT</div><div className="mt-3 text-sm font-semibold">{session.data?.user?.name || 'Guest farmer'}</div><div className="mt-1 text-xs text-muted-foreground">{session.data?.user?.email || 'Sign in to sync your farm'}</div><div className="mt-3 inline-flex rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">{titleCase(session.data?.user?.role)}</div></div><div className="rounded-2xl border border-border p-5"><div className="flex items-center gap-2 text-primary"><Cloud size={16} /><span className="eyebrow">YOUR DATA</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Coordinates are used for your forecast. Soil test values are optional and can be updated any time.</p></div></aside>
    </form>
  </div>;
}

function AppRouter() {
  const [location] = useLocation();
  if (location === '/auth') return <AuthPage />;
  return <AppShell><Switch>
    <Route path="/" component={Dashboard} />
    <Route path="/advisory/new" component={NewAdvisoryPage} />
    <Route path="/advisory/:id" component={AdvisoryDetailPage} />
    <Route path="/diagnose/:id" component={DiagnosisDetailPage} />
    <Route path="/diagnose" component={DiagnosisPage} />
    <Route path="/market" component={MarketPage} />
    <Route path="/chat" component={ChatPage} />
    <Route path="/history" component={HistoryPage} />
    <Route path="/profile" component={ProfilePage} />
    <Route component={NotFound} />
  </Switch></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppRouter /></WouterRouter></QueryClientProvider>;
}

export default App;