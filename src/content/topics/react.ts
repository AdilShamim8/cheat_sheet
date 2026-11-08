import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "react",
  name: "React",
  category: "topics",
  tier: "topic",
  tags: ["frontend", "ui", "components", "hooks", "server-components", "javascript", "declarative"],
  tagline: "The dominant UI library — components, hooks, and one-way data flow for interfaces from dashboards to design tools.",
  year: 2013,
  author: "Jordan Walke (Meta)",
  lastUpdated: "2026-11",

  tldr: [
    "React is a component-based UI library: you describe what the UI should look like for a given state, and React reconciles the DOM to match. It is not a full framework — routing, data fetching, and server concerns come from the ecosystem (Next.js, React Router) or the platform.",
    "It runs the largest share of the frontend world (85% usage in State of JS 2025; ~252M weekly npm downloads as of Nov 2026) and has the deepest hiring pool, component library ecosystem, and AI-tooling support of any UI technology.",
    "Reach for React when you need complex interactive state, a huge ecosystem, or hiring liquidity; it is the default for SaaS dashboards, design tools, and anything with rich client-side interaction.",
    "Avoid React for content-heavy sites where SSR frameworks or HTMX-style server rendering are simpler, or when a tiny bundle matters more than ecosystem (Preact, Solid, Svelte weigh less).",
  ],

  mentalModel: {
    title: "UI = f(state), and the tree re-renders top-down",
    body: "A React app is a tree of functions that take props+state and return a description of UI. When state changes, React re-runs the component function, diffs the result against the previous tree (reconciliation), and mutates only the DOM nodes that changed. You almost never touch the DOM imperatively — you change state and let the render flow do the work. The performance model follows directly: re-running functions is cheap, but reconciliation across a huge tree is not, so you fence hot subtrees with memo, useMemo, and keys. Since React 18, rendering is concurrent — React can pause, resume, and throw away in-progress renders, which is what makes transitions and Suspense non-blocking.",
  },

  constructs: [
    { syntax: "const [x, setX] = useState(0)", behavior: "Declares local state; setX triggers a re-render with the new value (batched by default).", when: "Every interactive value owned by one component." },
    { syntax: "useEffect(() => { ... }, [deps])", behavior: "Runs a side effect after commit; re-runs when deps change; cleanup function runs before the next run and on unmount.", when: "Syncing with external systems (subscriptions, timers, DOM measurement) — NOT for deriving data." },
    { syntax: "const v = useMemo(() => compute(a), [a])", behavior: "Caches a computed value between renders until deps change.", when: "Expensive derivations and referential stability for memoized children. Not for cheap math." },
    { syntax: "const ref = useRef(null)", behavior: "Mutable box that survives re-renders; .current does NOT trigger renders.", when: "DOM access, timers, previous values, 'instance' fields." },
    { syntax: "function C({ children }) { return <div>{children}</div> }", behavior: "Composition via the children slot — the primary reuse mechanism.", when: "Layouts, wrappers, panels. Prefer over config-driven rendering." },
    { syntax: "use(Context)", behavior: "Reads nearest provider value; re-renders when it changes.", when: "Themed data crossing many levels (auth, theme, locale). Not for high-frequency updates." },
    { syntax: "<Suspense fallback={<Spin/>}><Lazy/></Suspense>", behavior: "Shows fallback while suspended children (lazy import or async data) resolve.", when: "Code splitting and streaming server components boundaries." },
    { syntax: "const [p, tp] = useTransition(); tp(() => setState(x))", behavior: "Marks an update as non-urgent; keeps the old UI interactive during render.", when: "Search-as-you-type, tab switches, filtering big lists." },
    { syntax: "use(client) / use server directives", behavior: "Module-level markers that split the React Server Components boundary.", when: "Next.js App Router and RSC frameworks: server components fetch data, client components own interactivity." },
    { syntax: "const data = use(promise)", behavior: "Unwraps a promise inside render; suspends until resolved (React 19).", when: "Passing promises from server to client components; replaces useEffect-fetch." },
    { syntax: "useActionState(fn, initial)", behavior: "Binds a form action to pending state and returned result (React 19).", when: "Forms with server actions: pending spinners, error messages without manual isSubmitting state." },
  ],

  patterns: [
    {
      lang: "javascript",
      caption: "Lifted state + derived data (no effects)",
      code: `function ProductPicker({ products }) {
  const [query, setQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);

  // Derived during render — no useEffect, no extra state, always consistent
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (!onlyInStock || p.inStock)
    );
  }, [products, query, onlyInStock]);

  return (
    <>
      <SearchInput value={query} onChange={setQuery} />
      <Toggle checked={onlyInStock} onChange={setOnlyInStock} />
      <ProductList items={visible} />
    </>
  );
}

// Rule: if you can compute it from props/state during render,
// it is NOT state. Effects are for synchronizing with the outside
// world, not for deriving data.`,
    },
    {
      lang: "javascript",
      caption: "Custom hook — the reuse unit of React",
      code: `function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);   // cleanup cancels the stale timer
  }, [value, delay]);

  return debounced;
}

// Consumer: search-as-you-type without prop-drilling
function Search({ onQuery }) {
  const [text, setText] = useState("");
  const debounced = useDebouncedValue(text, 400);
  useEffect(() => { onQuery(debounced); }, [debounced, onQuery]);
  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}`,
    },
    {
      lang: "javascript",
      caption: "Reducer + context for complex feature state",
      code: `const CartCtx = createContext(null);

function cartReducer(state, action) {
  switch (action.type) {
    case "add":  return { ...state, items: [...state.items, action.item] };
    case "remove": return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    default: throw new Error("unknown action: " + action.type);
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}`,
    },
    {
      lang: "javascript",
      caption: "Server Component + action form (React 19 / RSC pattern)",
      code: `// app/products/page.tsx — Server Component: runs on the server, zero JS shipped
import { db } from "@/lib/db";

export default async function ProductsPage() {
  const products = await db.product.findMany({ take: 50 });

  async function create(formData: FormData) {        // Server Action
    "use server";
    await db.product.create({
      data: { name: formData.get("name") as string },
    });
    revalidatePath("/products");
  }

  return (
    <>
      <form action={create}>
        <input name="name" required />
        <SubmitButton />   {/* uses useFormStatus internally */}
      </form>
      <ul>{products.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
    </>
  );
}

// Client component for pending UX — no manual isSubmitting anywhere
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "Saving..." : "Add"}</button>;
}`,
    },
    {
      lang: "javascript",
      caption: "Optimistic list mutation (useOptimistic, React 19)",
      code: `function TodoList({ todos, addTodo }) {
  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (current, newTodo) => [...current, { ...newTodo, pending: true }]
  );

  async function action(formData) {
    const text = formData.get("text");
    addOptimistic({ id: "temp", text });        // shows instantly
    await addTodo(text);                         // server catches up
  }

  return (
    <form action={action}>
      {optimisticTodos.map((t) => (
        <li key={t.id} style={{ opacity: t.pending ? 0.5 : 1 }}>{t.text}</li>
      ))}
      <input name="text" />
    </form>
  );
}`,
    },
  ],

  pitfalls: [
    { title: "Derived data stored in state", symptom: "useState + useEffect copying props into state — the UI shows stale values after the parent re-renders with new props.", fix: "If it can be computed from props/state, compute it during render (or useMemo). State is only for values that change independently of inputs." },
    { title: "Stale closures in effects and callbacks", symptom: "setInterval / event listener inside useEffect sees old state values forever.", fix: "The effect captured the state at run time. Either add the value to deps, use a ref for the latest value, or read via functional updates setX(x => x + 1)." },
    { title: "Keys from array index in reorderable lists", symptom: "Inputs keep the wrong value after sort/filter — component identity follows position, not item.", fix: "Use stable unique ids as keys. Index keys are safe only for append-only static lists." },
    { title: "useEffect for data fetching causes waterfalls", symptom: "Fetch-in-useEffect runs after paint, serially per component — slow pages, race conditions on fast typing.", fix: "Fetch on the server (RSC/route loaders) or use a data library (TanStack Query, RSC, SWR) with keys. Never hand-roll fetch races in effects." },
    { title: "mutating state instead of replacing it", symptom: "state.items.push(x) does nothing visible — same reference, React skips the render.", fix: "Always create new references: setItems([...items, x]). Nested objects need spread at each level — Immer makes deep updates ergonomic." },
    { title: "Overusing useMemo/useCallback/memo", symptom: "Wrapped everything 'for performance' — code is unreadable and may be slower (memo comparison cost).", fix: "Measure first (React DevTools Profiler). Memoize referential stability only where a memoized child actually re-renders expensively. React Compiler (RC 2026) automates this." },
    { title: "Calling hooks conditionally", symptom: "If a hook runs after an early return, React throws 'Rendered fewer hooks than expected' and the tree crashes.", fix: "Hooks must run unconditionally in the same order every render — move early returns below all hooks, extract the conditional part into a component." },
    { title: "Client Components by default in RSC apps", symptom: "Whole app ships as JS because every file starts with 'use client'.", fix: "Only leaf interactive components are client. Layouts, data fetching, and static content stay server components; pass serializable props down." },
  ],

  quickReference: [
    { fact: "React 19 (Dec 2024) made Actions, useActionState, useOptimistic, useFormStatus, ref-as-prop, and Document Metadata stable; 19.3 (Sep 2026) added <ViewTransition/> and the browser() react-dom entry.", tag: "version" },
    { fact: "State of JS 2025: 85% usage, 72% retention. npm: ~252M weekly downloads — an order of magnitude above every other UI library.", tag: "usage" },
    { fact: "Server Components render on the server, never hydrate, and ship zero JS; Client Components hydrate and own state. The boundary is the 'use client' directive.", tag: "rsc" },
    { fact: "setX updates are batched automatically (React 18+) — multiple setX in one handler cause one render. Automatic batching applies inside promises and timeouts too.", tag: "behavior" },
    { fact: "React Compiler (RC, 2026) auto-memoizes components — the long-term answer to manual useMemo/useCallback everywhere.", tag: "version" },
    { fact: "Strict Mode double-invokes render+effects in dev to surface impure functions and missing cleanup — never disable it to 'fix' double fetches.", tag: "debug" },
    { fact: "Keys must be stable and unique among siblings — they are identity, not ordering. crypto.randomUUID() for new items; never Math.random().", tag: "gotcha" },
    { fact: "Error boundaries catch render errors in a subtree — class components with componentDidCatch, or react-error-boundary. They do NOT catch event handlers or effects.", tag: "error" },
    { fact: "Hydration mismatch = server HTML differs from first client render. Causes: Date.now(), Math.random(), locale-dependent formatting during render.", tag: "debug" },
    { fact: "Suspense works for lazy() AND for thrown-then-resolved promises (RSC / React 19 use()). Fallback replaces the whole subtree while pending.", tag: "rsc" },
    { fact: "Tearing = different parts of the UI show different state after an update; concurrent React prevents it by committing renders atomically.", tag: "behavior" },
    { fact: "Profiler flame graph in React DevTools is the ground truth for re-render cost — flamegraph + 'why did this render' beats guessing.", tag: "debug" },
    { fact: "React's test story: React Testing Library (query by role/label, user-event), Vitest/Jest runner. Test behavior, not internals.", tag: "test" },
    { fact: "ForwardRef is dead code in React 19 — ref is now a regular prop. Remove forwardRef wrappers when upgrading.", tag: "migration" },
  ],

  goDeeper: [
    { title: "React release notes and announcements", url: "https://react.dev/blog", note: "Primary source for tracking what is current — check here before trusting any cheat sheet, including this one." },
    { title: "react.dev — Official Docs", url: "https://react.dev/learn", note: "The rewritten docs (2023+) are the best learning resource in frontend; start with 'Thinking in React' and 'You Might Not Need an Effect'." },
    { title: "React Working Group — Discussions", url: "https://github.com/reactwg/react-19", note: "Design notes and upgrade guides straight from the React team." },
    { title: "New React Documentation — Server Components", url: "https://react.dev/reference/rsc/server-components", note: "The RSC mental model, the client/server boundary, and what serializes across it." },
    { title: "TanStack Query docs", url: "https://tanstack.com/query/latest", note: "The standard client-side async-state layer: caching, dedupe, retries, invalidation." },
    { title: "React Compiler (React blog)", url: "https://react.dev/learn/react-compiler", note: "How automatic memoization works and how to adopt it incrementally." },
  ],

  // ─── §8 Data types (React's "types" = what flows through components) ─────
  dataTypes: {
    primitives: [
      { syntax: "props: string | number | boolean", behavior: "Serializable primitives — render as text; simplest to pass across the RSC boundary.", when: "Labels, ids, flags, counts." },
      { syntax: "enum-ish: 'small' | 'medium' | 'large'", behavior: "String literal unions — the de facto enum for variant props.", when: "Variant APIs. TypeScript gives exhaustiveness checking in switch." },
      { syntax: "React.ReactNode", behavior: "Anything renderable: element, string, null, fragment, array, portal.", when: "children and render-slot props." },
      { syntax: "key: React.Key", behavior: "Stable identity for list reconciliation (string | number | bigint).", when: "Map keys; must be unique among siblings, stable across renders." },
    ],
    collections: [
      { syntax: "items.map(x => <Row key={x.id} .../>)", behavior: "Rendering lists — map returns elements; React reconciles by key.", when: "Any collection render. Filter/sort the array, not the DOM." },
      { syntax: "Array.prototype.reduce for grouped UI", behavior: "Group rows by bucket into an object of arrays before render.", when: "Grouped lists — cheaper than nested filters per group." },
      { syntax: "Set/Map in state", behavior: "Reference types — replace, don't mutate (new Set([...s, x])).", when: "Selections, tags, dedupe. Fast membership checks." },
      { syntax: "Record<string, T> lookups", behavior: "Object map by id — O(1) access instead of arr.find().", when: "Normalized entity state (the Redux/RTK pattern)." },
    ],
    custom: [
      { syntax: "type Props = { title: string; onClose: () => void }", behavior: "The component contract — checked by TypeScript at every call site.", when: "Every component. Prefer specific types over React.FC (implicit children gotcha)." },
      { syntax: "type Reducer<S, A>", behavior: "Pure (state, action) => state function — the state machine pattern.", when: "useReducer stores: multi-field, transition-heavy state." },
      { syntax: "interface CustomHook { data; isPending; error }", behavior: "Async-state triple returned by data hooks (TanStack Query convention).", when: "Any async hook API — callers render {isPending ? ... : data}." },
      { syntax: "Zod/infer schemas at boundaries", behavior: "Parse untrusted input (forms, API) into typed values; infer the TS type.", when: "Forms (react-hook-form + zod) and RSC action inputs." },
    ],
  },

  // ─── §9 Operators & expressions (JSX & conditional rendering) ─────────────
  operators: [
    { syntax: "condition && <Badge/>", behavior: "Renders Badge only when truthy. 0 renders '0', NaN renders 'NaN' — classic footgun.", when: "Simple conditional presence. Guard counts: n > 0 && <List/>." },
    { syntax: "cond ? <A/> : <B/>", behavior: "Ternary — inline branch in JSX.", when: "Two-way UI branches. Nested ternaries: extract a component." },
    { syntax: "null / undefined / false", behavior: "Render nothing — the only falsy values JSX ignores.", when: "Early returns for guards: if (!user) return null." },
    { syntax: "{...props} spread", behavior: "Forwards all props; order matters — later keys win.", when: "Wrapper components. Spread explicit rest (...rest) to avoid leaking internals to the DOM." },
    { syntax: "?? (nullish) vs || (or)", behavior: "?? falls back only on null/undefined; || also on 0/''/false.", when: "Default values where 0 or '' are valid (pageSize ?? 10, not ||)." },
    { syntax: "?., optional chaining", behavior: "Safe deep access user?.address?.city — undefined instead of throw.", when: "Data from APIs and partially-loaded RSC payloads." },
  ],

  // ─── §10 I/O: data flow in and out of components ─────────────────────────
  inputOutput: [
    {
      lang: "javascript",
      caption: "Data in: props drilling vs composition",
      code: `// Prop drilling — 3 intermediate components pass user they don't use
<Page user={user} /> → <Sidebar user={user} /> → <Avatar user={user} />

// Composition inversion — Page owns data, slots the display
function Page() {
  const user = useCurrentUser();
  return <Sidebar><Avatar user={user} /></Sidebar>;
}

// Context — for genuinely ambient data (auth, theme, locale)
const UserCtx = createContext(null);
<UserCtx.Provider value={user}><DeepTree/></UserCtx.Provider>
// In DeepTree: const user = useContext(UserCtx);`,
    },
    {
      lang: "javascript",
      caption: "Data out: controlled vs uncontrolled inputs",
      code: `// Controlled — React state is the source of truth (validation-friendly)
function NameField() {
  const [name, setName] = useState("");
  const valid = name.trim().length >= 2;
  return (
    <input value={name} onChange={(e) => setName(e.target.value)}
           aria-invalid={!valid} />
  );
}

// Uncontrolled — the DOM owns state; read on submit (form-heavy pages)
function SearchBox({ onSubmit }) {
  const ref = useRef(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(ref.current.value); }}>
      <input ref={ref} defaultValue="" />
    </form>
  );
}
// React 19: <form action={fn}> + FormData replaces most controlled forms.`,
    },
    {
      lang: "javascript",
      caption: "Server actions: mutations with progressive enhancement",
      code: `"use server";
export async function updateProfile(formData: FormData) {
  const name = formData.get("name") as string;
  const ok = await db.user.update({ where: { id: session() }, data: { name } });
  if (!ok) return { error: "update failed" };
  revalidatePath("/profile");
}

// Client side — pending + result without a line of local state
"use client";
function ProfileForm({ action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input name="name" defaultValue={state.name} />
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>{pending ? "..." : "Save"}</button>
    </form>
  );
}`,
    },
  ],

  // ─── §11 Loops & iteration in render ──────────────────────────────────────
  loops: [
    {
      lang: "javascript",
      caption: "Lists, groups, and grids",
      code: `// Flat list — stable keys, no index
rows.map((r) => <Row key={r.id} row={r} />)

// Grouped list — reduce once, then render buckets
const groups = useMemo(() =>
  rows.reduce((acc, r) => {
    (acc[r.status] ||= []).push(r);
    return acc;
  }, {}), [rows]);

Object.entries(groups).map(([status, items]) => (
  <section key={status}>
    <h3>{status} ({items.length})</h3>
    {items.map((r) => <Row key={r.id} row={r} />)}
  </section>
));

// Virtualize anything over a few hundred rows
import { useVirtualizer } from "@tanstack/react-virtual";
const virtual = useVirtualizer({ count: rows.length, getScrollElement, estimateSize: 44 });
virtual.getVirtualItems().map((v) => (
  <Row key={rows[v.index].id} ref={virtual.measureElement} />
));`,
    },
    {
      lang: "javascript",
      caption: "Slot/child iteration and fragment keys",
      code: `// Children utilities — mapping over slot content
import { Children, isValidElement, cloneElement } from "react";

function RadioGroup({ value, onChange, children }) {
  return Children.map(children, (child) =>
    isValidElement(child)
      ? cloneElement(child, { checked: value === child.props.value, onChange })
      : child
  );
}
// Prefer explicit array props or context over cloneElement in new code.

// keyed fragments when a loop returns multiple roots
items.map((i) => (
  <React.Fragment key={i.id}>
    <dt>{i.term}</dt>
    <dd>{i.def}</dd>
  </React.Fragment>
));`,
    },
  ],

  // ─── §12 Functions & callables ────────────────────────────────────────────
  functions: [
    {
      lang: "javascript",
      caption: "Component as closure — props are the arguments",
      code: `// A component IS a function: props in, UI out. Pure = same props,
// same UI. Everything else (effects, refs) is escape hatch.
function Badge({ count, max = 99, tone = "neutral" }) {
  const label = count > max ? max + "+" : String(count);
  return <span className={\`badge badge-\${tone}\`}>{label}</span>;
}

// HOCs are just higher-order functions over components
function withAuth(Component) {
  return function AuthGate(props) {
    const user = useCurrentUser();
    if (!user) return <LoginPrompt />;
    return <Component {...props} user={user} />;
  };
}`,
    },
    {
      lang: "javascript",
      caption: "Custom hooks — stateful logic extraction",
      code: `// Hooks compose: a hook can call other hooks. That's the whole trick.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// use(state) machine pattern for async resources (React 19)
function usePost(id) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { setPost(await fetchJSON("/api/posts/" + id)); }
    catch (e) { setError(e); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  return { post, error, reload: load };
}`,
    },
    {
      lang: "javascript",
      caption: "Render props and headless components",
      code: `// Headless hook pattern (TanStack Table style) — logic without markup
function useSortable(items) {
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const sorted = useMemo(() => {
    if (!sort.key) return items;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => a[sort.key] > b[sort.key] ? dir : -dir);
  }, [items, sort]);
  const toggle = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  return { sorted, sort, toggle };
}

// Consumer owns 100% of the rendering
const { sorted, sort, toggle } = useSortable(users);
<th onClick={() => toggle("name")}>Name {sort.key === "name" ? sort.dir : ""}</th>`,
    },
  ],

  // ─── §13 Error handling ───────────────────────────────────────────────────
  errorHandling: [
    {
      lang: "javascript",
      caption: "Error boundaries + reset keys",
      code: `import { ErrorBoundary } from "react-error-boundary";

function Crash({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something broke: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

<ErrorBoundary
  FallbackComponent={Crash}
  onReset={() => queryClient.resetQueries()}   // clear the poisoned cache
  resetKeys={[userId]}                          // auto-retry when input changes
>
  <ProfileSection userId={userId} />
</ErrorBoundary>

// Errors thrown anywhere below this boundary (render, lifecycle)
// land in Crash. Event handlers and effects do NOT — wrap those
// in try/catch or use TanStack Query's error state.`,
    },
    {
      lang: "javascript",
      caption: "Async errors: suspense for load, boundary for failure",
      code: `// Load state = Suspense fallback; failure = error boundary retry.
function ProfileRoute({ id }) {
  return (
    <ErrorBoundary FallbackComponent={AsyncCrash} resetKeys={[id]}>
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile id={id} />
      </Suspense>
    </ErrorBoundary>
  );
}

async function Profile({ id }) {
  const user = await fetchUser(id);      // suspends on the server or via use()
  return <ProfileCard user={user} />;
}

// Server actions return typed errors instead of throwing to the shell:
// { error: "rate_limited" } rendered inline via useActionState.`,
    },
  ],

  // ─── §14 Concurrency (concurrent rendering + async UI) ───────────────────
  concurrency: [
    {
      lang: "javascript",
      caption: "Transitions: urgent vs non-urgent updates",
      code: `function FilterableList({ items }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function onChange(e) {
    setQuery(e.target.value);                    // urgent: input stays snappy
    startTransition(() => setFilter(e.target.value)); // non-urgent: list can lag
  }

  return (
    <>
      <input value={query} onChange={onChange} />
      <ul style={{ opacity: isPending ? 0.6 : 1 }}>
        {filtered.map((i) => <Row key={i.id} item={i} />)}
      </ul>
    </>
  );
}
// Concurrent React keeps the old list interactive while the new
// one renders — interruptible by design, no more frozen inputs.`,
    },
    {
      lang: "javascript",
      caption: "Streaming with Suspense boundaries",
      code: `// Route shell streams immediately; slow sections arrive when ready.
function Dashboard() {
  return (
    <>
      <Header />                                  // instant
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />                          // streams in at t+400ms
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <BigTable />                              // streams in at t+1.5s
      </Suspense>
    </>
  );
}
// Each boundary is an independent loading unit — colocate fallbacks
// with the slow subtree (not one spinner for the whole page).`,
    },
    {
      lang: "javascript",
      caption: "useSyncExternalStore: tearing-proof external state",
      code: `// For stores outside React (zustand, redux, URL, window)
const width = useSyncExternalStore(
  (cb) => window.addEventListener("resize", cb),   // subscribe
  () => window.innerWidth,                          // client snapshot
  () => 0                                           // server snapshot
);
// Guarantees a consistent snapshot across concurrent renders —
// hand-rolled subscription + state WILL tear.`,
    },
  ],

  // ─── §15 Testing ─────────────────────────────────────────────────────────
  testing: [
    {
      lang: "javascript",
      caption: "Behavior-first component tests (RTL + Vitest)",
      code: `import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("shows remaining chars while typing", async () => {
  const user = userEvent.setup();
  render(<BioField max={100} />);

  await user.type(screen.getByRole("textbox", { name: /bio/i }), "hello");

  expect(screen.getByText("95 left")).toBeVisible();
});

// Query by role/label/text the way a user perceives the UI —
// getByTestId is the last resort. user-event over fireEvent
// (fires focus, keydown, input — the real browser sequence).`,
    },
    {
      lang: "javascript",
      caption: "MSW: mock at the network boundary",
      code: `import { http, HttpResponse, setupServer } from "msw/node";

const server = setupServer(
  http.get("/api/user/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, name: "Ada" })
  ),
  http.post("/api/user", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(body, { status: 201 });
  })
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());

// One layer of mocks covers fetch, TanStack Query, and RSC fetches —
// component tests stay free of fetch plumbing entirely.`,
    },
    {
      lang: "javascript",
      caption: "E2E with Playwright",
      code: `import { test, expect } from "@playwright/test";

test("checkout flow", async ({ page }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();

  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.getByText("Order confirmed")).toBeVisible();
});
// E2E is for critical flows only (checkout, auth, core funnel) —
// keep the pyramid shape: many unit, some integration, few E2E.`,
    },
  ],

  // ─── §16 Performance ─────────────────────────────────────────────────────
  performance: [
    { fact: "Measure with React DevTools Profiler flame graph before optimizing anything — 'why did this render' beats intuition every time.", tag: "profiling" },
    { fact: "The default fix is moving state down / lifting content up (composition), not memo(). Fewer re-renders beats faster re-renders.", tag: "render" },
    { fact: "List virtualization (TanStack Virtual) keeps 100k-row tables at 60fps — render only visible rows + overscan.", tag: "lists" },
    { fact: "Route-level code splitting via lazy()/Suspense or framework routers; measure bundle impact with @next/bundle-analyzer or source-map-explorer.", tag: "bundle" },
    { fact: "Images are the biggest bytes on most pages: next/image-style responsive sizes, AVIF/WebP, explicit width/height to kill CLS.", tag: "assets" },
    { fact: "Server Components remove client JS wholesale — the fastest code is the code you never ship.", tag: "rsc" },
    { fact: "Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. INP replaced FID in Core Web Vitals (2024).", tag: "metrics" },
    { fact: "useTransition/useDeferredValue keep input responsive on expensive renders — interruptible rendering is free if you opt in.", tag: "concurrent" },
    { fact: "Keys that stay stable across reorderings prevent subtree remounts — the cheapest perf fix in React.", tag: "lists" },
    { fact: "Debounce expensive work on user input (search), but keep the input itself uncontrolled or urgent-updated.", tag: "concurrent" },
    { fact: "React Compiler auto-memoizes components — removes most manual useMemo/useCallback in app code (RC in 2026).", tag: "compiler" },
    { fact: "Hydration cost scales with client-component tree size; push 'use client' to the leaves.", tag: "rsc" },
  ],

  // ─── §17 Ecosystem & tooling ─────────────────────────────────────────────
  ecosystem: [
    { tool: "Next.js", purpose: "The dominant React framework: App Router RSC, routing, SSR/SSG, caching. Current: 16.4.x.", url: "https://nextjs.org/docs", category: "framework" },
    { tool: "TanStack Query", purpose: "Async state: caching, dedupe, retries, optimistic updates. The client-data standard.", url: "https://tanstack.com/query/latest", category: "data" },
    { tool: "TanStack Router / React Router 7", purpose: "Type-safe routing; React Router 7 merged Remix features.", url: "https://tanstack.com/router/latest", category: "routing" },
    { tool: "Zustand / Redux Toolkit", purpose: "Client state stores. Zustand for lean apps; RTK for heavy normalized state.", url: "https://zustand.docs.pmnd.rs/", category: "state" },
    { tool: "react-hook-form + Zod", purpose: "Performant forms with schema validation — the 2026 default stack.", url: "https://react-hook-form.com/", category: "forms" },
    { tool: "Tailwind CSS", purpose: "Utility-first styling — pairs naturally with component composition. Current: 4.3.x.", url: "https://tailwindcss.com/", category: "styling" },
    { tool: "shadcn/ui", purpose: "Copy-paste accessible component patterns on Radix + Tailwind — the ecosystem default kit.", url: "https://ui.shadcn.com/", category: "ui" },
    { tool: "Vite", purpose: "Dev server + bundler for SPA React apps (behind Next.js for full-stack). Current: 8.3.x.", url: "https://vite.dev/", category: "build" },
    { tool: "Vitest + React Testing Library", purpose: "Unit/behavior tests with jsdom; MSW for network mocking.", url: "https://vitest.dev/", category: "test" },
    { tool: "Playwright", purpose: "Cross-browser E2E; trace viewer makes failures debuggable.", url: "https://playwright.dev/", category: "test" },
    { tool: "Storybook", purpose: "Component workshop: isolated dev, visual tests, docs.", url: "https://storybook.js.org/", category: "test" },
    { tool: "Biome", purpose: "Rust-based lint+format for JS/TS — the fast alternative to ESLint+Prettier.", url: "https://biomejs.dev/", category: "lint" },
    { tool: "React DevTools", purpose: "Profiler + component tree inspector; the first tool you open.", url: "https://react.dev/learn/react-developer-tools", category: "debug" },
    { tool: "rsbuild / Rspack", purpose: "Rust bundlers for large SPAs where Vite's dev scales thin.", url: "https://rspack.dev/", category: "build" },
  ],

  // ─── §18 Version history ─────────────────────────────────────────────────
  versionHistory: [
    { version: "0.3 / open source", year: 2013, highlight: "Jordan Walke's FaxJS prototype becomes React, open-sourced at JSConf US — initial reception hostile to JSX and inline HTML." },
    { version: "16.8", year: 2019, highlight: "Hooks — useState/useEffect let function components own state and effects; class components begin their long retirement." },
    { version: "16.13 / 17", year: 2020, highlight: "Event delegation refactor, new JSX transform (no React import), gradual rollout groundwork for concurrent features." },
    { version: "18", year: 2022, highlight: "Concurrent renderer, automatic batching, Suspense on the server, streaming SSR, useTransition/useDeferredValue/useId." },
    { version: "19", year: 2024, highlight: "Actions + useActionState/useOptimistic/useFormStatus, ref-as-prop, Document Metadata, cleanup-function refs, React Compiler preview." },
    { version: "19.1", year: 2025, highlight: "ViewTransition types, Activity component, use aggregate View; React Compiler beta in Next.js." },
    { version: "19.3", year: 2026, highlight: "<ViewTransition/> component stable, Fragment refs, browser() react-dom entry, Trusted Types integration, React Compiler RC." },
  ],

  // ─── §19 Interview hot questions ─────────────────────────────────────────
  interview: [
    { q: "What's the difference between state and props?", a: "Props are read-only inputs passed from the parent — configuration from the outside. State is data the component owns and can change over time. A component shouldn't mutate its props; changing state is the one sanctioned way to trigger re-renders. When two components need the same mutable data, that state moves to their closest common ancestor (lifting state up).", difficulty: "easy" },
    { q: "Why must hooks be called unconditionally at the top level?", a: "React tracks hooks per component by call order — it stores hook state in a linked list indexed by position. Conditional hooks shift positions, so React reads state belonging to another hook, corrupting the tree ('rendered fewer hooks than expected'). The rule follows from the implementation, not style: same order every render or state gets mismapped.", difficulty: "medium" },
    { q: "When do you actually need useEffect?", a: "Only to synchronize with systems outside React: subscriptions, timers, imperative DOM APIs, logging beacons, integrating non-React widgets. If the effect computes data for render (derived state), syncs two pieces of React state, or handles user events, it's the wrong tool — compute during render, or handle events in handlers. The docs essay 'You Might Not Need an Effect' is the canonical answer.", difficulty: "medium" },
    { q: "Explain reconciliation and the role of keys.", a: "On state change React builds a new element tree and diffs it against the old one: same type at the same position → reuse the DOM node and update props; different type → destroy and remount the subtree. Lists reconcile by key: matching keys keep component state and DOM across reorders. Index keys break this — sorting moves state to the wrong rows — hence 'stable unique ids'.", difficulty: "medium" },
    { q: "What problem do React Server Components solve?", a: "RSC moves rendering of data-heavy/static parts to the server with zero hydration cost: components run there, fetch directly (no API hop), and ship serialized output instead of component code. Client components hydrate only the interactive leaves. The win is bundle size and data locality — a product page renders from the DB with the JS cost of only its buttons and forms.", difficulty: "medium" },
    { q: "How does concurrent rendering change update semantics?", a: "Since 18, renders are interruptible: React can pause a low-priority render to handle input, then resume or discard it. Updates are split into urgent (input.value) and transition-wrapped (filtered results). This eliminates the 'frozen page during expensive render' failure mode and enables Suspense streaming — at the cost of render purity being strictly enforced (Strict Mode double-invokes to catch violations).", difficulty: "hard" },
    { q: "Why is prop drilling not always bad, and what are the alternatives?", a: "Passing props through a few levels is explicit data flow — easy to trace and refactor; reach for context or state libraries only when drilling crosses many uninterested components. Alternatives in order of preference: composition (children as slots), lifting state differently, context for ambient data (theme/auth), and component/store libraries (Zustand, Jotai) for truly shared client state. Context re-renders every consumer on value change, so it's not a free global.", difficulty: "medium" },
    { q: "Controlled vs uncontrolled inputs — when each?", a: "Controlled: React state mirrors the input on every keystroke — needed for live validation, conditional UI, formatting. Costs a render per keystroke (fine for forms, measurable for huge tables of inputs). Uncontrolled: DOM holds the value; read via ref on submit — cheaper and simpler for plain forms. React 19's form actions lean uncontrolled: the form owns its data in FormData and the action handles submission.", difficulty: "easy" },
    { q: "What is hydration, and what causes hydration mismatches?", a: "Hydration attaches event listeners and state to the server-rendered HTML so it becomes interactive — React replays the render on the client and 'adopts' the existing DOM. Mismatch = client first render differs from server HTML: caused by Date.now(), Math.random(), locale/timezone formatting, or browser-only APIs during render. React downgrades to client re-render (losing SSR benefits) or errors — fix by moving non-deterministic values to effects or ensuring server/client render identical output.", difficulty: "medium" },
    { q: "How would you diagnose and fix a slow React page?", a: "Reproduce, then React DevTools Profiler: record the interaction, read the flame graph — wide commits and 'why did this render' identify the expensive subtree and cause. Fixes in order of impact: move state down to the smallest subtree, split heavy renders with transitions, virtualize long lists, memo the boundary if referential instability is proven, code-split the route, and push static/data-heavy parts to server components. Never memo blindly — each memo has a comparison cost.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ─────────────────────────────────────────────────────
  comparisons: [
    { vs: "Vue", whenThis: "Largest ecosystem and hiring pool, deep AI-tool support, best fit for complex stateful apps with big teams and long lifetimes.", whenThat: "Gentler learning curve with official router/state/style guides in one package; template syntax preferred by design-adjacent teams. 52% usage in State of JS 2025 — massive but smaller." },
    { vs: "Svelte", whenThis: "You want the mature ecosystem, explicitness at scale, and the option of RSC server rendering; hiring at volume.", whenThat: "Smaller runtime (compiler does the work), nicer defaults for small-to-mid interactive sites; highest retention (86%) but ~27% usage and a thinner component/job market." },
    { vs: "Angular", whenThis: "UI library philosophy — pick your own router/state/styling; best for product teams iterating fast.", whenThat: "Full opinionated framework with DI, forms, and strict conventions — favored in large enterprise/regulated shops with Java/.NET heritage." },
    { vs: "Solid", whenThis: "Ecosystem gravity and RSC path; React knowledge transfers everywhere.", whenThat: "Fine-grained reactivity (no VDOM) with the highest satisfaction (89% five years running) — for performance-first apps that accept a smaller community." },
    { vs: "HTMX/server-rendered", whenThis: "Rich client state: editors, dashboards, drag-drop, optimistic multi-widget sync.", whenThat: "Server-rendered HTML with hypermedia interactivity — drastically less JS for CRUD apps where the server already owns the state." },
  ],
};

export default sheet;
