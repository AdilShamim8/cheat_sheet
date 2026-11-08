# React

**Category:** Topics · **Tier:** Topic · **Tags:** frontend, ui, components, hooks, server-components, javascript, declarative · **First released:** 2013 · **Author:** Jordan Walke (Meta) · **Last updated:** 2026-11

> The dominant UI library — components, hooks, and one-way data flow for interfaces from dashboards to design tools.

---

## TL;DR

- React is a component-based UI library: you describe what the UI should look like for a given state, and React reconciles the DOM to match. It is not a full framework — routing, data fetching, and server concerns come from the ecosystem (Next.js, React Router) or the platform.
- It runs the largest share of the frontend world (85% usage among front-end framework users in State of JS 2025; ~253M weekly npm downloads as of Nov 2026) and has the deepest hiring pool, component library ecosystem, and AI-tooling support of any UI technology.
- Reach for React when you need complex interactive state, a huge ecosystem, or hiring liquidity; it is the default for SaaS dashboards, design tools, and anything with rich client-side interaction.
- Avoid React for content-heavy sites where SSR frameworks or HTMX-style server rendering are simpler, or when a tiny bundle matters more than ecosystem (Preact, Solid, Svelte weigh less).

## Core Mental Model

**UI = f(state), and the tree re-renders top-down.** A React app is a tree of functions that take props+state and return a description of UI. When state changes, React re-runs the component function, diffs the result against the previous tree (reconciliation), and mutates only the DOM nodes that changed. You almost never touch the DOM imperatively — you change state and let the render flow do the work. The performance model follows directly: re-running functions is cheap, but reconciliation across a huge tree is not, so you fence hot subtrees with memo, useMemo, and keys. Since React 18, rendering is concurrent — React can pause, resume, and throw away in-progress renders, which is what makes transitions and Suspense non-blocking.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| const [x, setX] = useState(0) | Declares local state; setX triggers a re-render with the new value (batched by default). | Every interactive value owned by one component. |
| useEffect(() => { ... }, [deps]) | Runs a side effect after commit; re-runs when deps change; cleanup function runs before the next run and on unmount. | Syncing with external systems (subscriptions, timers, DOM measurement) — NOT for deriving data. |
| const v = useMemo(() => compute(a), [a]) | Caches a computed value between renders until deps change. | Expensive derivations and referential stability for memoized children. Not for cheap math. |
| const ref = useRef(null) | Mutable box that survives re-renders; .current does NOT trigger renders. | DOM access, timers, previous values, 'instance' fields. |
| function C({ children }) { return <div>{children}</div> } | Composition via the children slot — the primary reuse mechanism. | Layouts, wrappers, panels. Prefer over config-driven rendering. |
| use(Context) | Reads nearest provider value; re-renders when it changes. | Themed data crossing many levels (auth, theme, locale). Not for high-frequency updates. |
| <Suspense fallback={<Spin/>}><Lazy/></Suspense> | Shows fallback while suspended children (lazy import or async data) resolve. | Code splitting and streaming server components boundaries. |
| const [p, tp] = useTransition(); tp(() => setState(x)) | Marks an update as non-urgent; keeps the old UI interactive during render. | Search-as-you-type, tab switches, filtering big lists. |
| use(client) / use server directives | Module-level markers that split the React Server Components boundary. | Next.js App Router and RSC frameworks: server components fetch data, client components own interactivity. |
| const data = use(promise) | Unwraps a promise inside render; suspends until resolved (React 19). | Passing promises from server to client components; replaces useEffect-fetch. |
| useActionState(fn, initial) | Binds a form action to pending state and returned result (React 19). | Forms with server actions: pending spinners, error messages without manual isSubmitting state. |

## Idiomatic Patterns

**Lifted state + derived data (no effects)**

```javascript
function ProductPicker({ products }) {
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
// world, not for deriving data.
```

**Custom hook — the reuse unit of React**

```javascript
function useDebouncedValue(value, delay = 300) {
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
}
```

**Reducer + context for complex feature state**

```javascript
const CartCtx = createContext(null);

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
}
```

**Server Component + action form (React 19 / RSC pattern)**

```javascript
// app/products/page.tsx — Server Component: runs on the server, zero JS shipped
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
}
```

**Optimistic list mutation (useOptimistic, React 19)**

```javascript
function TodoList({ todos, addTodo }) {
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
}
```

## Common Pitfalls

1. **Upgrading to 19 without removing forwardRef** — *Symptom:* React 19 logs warnings and ref props stop flowing through forwardRef wrappers. *Fix:* ref is a normal prop since 19 — delete forwardRef wrappers, accept ref in props. Codemod provided by the React team.
2. **Derived data stored in state** — *Symptom:* useState + useEffect copying props into state — the UI shows stale values after the parent re-renders with new props. *Fix:* If it can be computed from props/state, compute it during render (or useMemo). State is only for values that change independently of inputs.
3. **Stale closures in effects and callbacks** — *Symptom:* setInterval / event listener inside useEffect sees old state values forever. *Fix:* The effect captured the state at run time. Either add the value to deps, use a ref for the latest value, or read via functional updates setX(x => x + 1).
4. **Keys from array index in reorderable lists** — *Symptom:* Inputs keep the wrong value after sort/filter — component identity follows position, not item. *Fix:* Use stable unique ids as keys. Index keys are safe only for append-only static lists.
5. **useEffect for data fetching causes waterfalls** — *Symptom:* Fetch-in-useEffect runs after paint, serially per component — slow pages, race conditions on fast typing. *Fix:* Fetch on the server (RSC/route loaders) or use a data library (TanStack Query, RSC, SWR) with keys. Never hand-roll fetch races in effects.
6. **mutating state instead of replacing it** — *Symptom:* state.items.push(x) does nothing visible — same reference, React skips the render. *Fix:* Always create new references: setItems([...items, x]). Nested objects need spread at each level — Immer makes deep updates ergonomic.
7. **Overusing useMemo/useCallback/memo** — *Symptom:* Wrapped everything 'for performance' — code is unreadable and may be slower (memo comparison cost). *Fix:* Measure first (React DevTools Profiler). Memoize referential stability only where a memoized child actually re-renders expensively. React Compiler (stable since Oct 2025) automates this.
8. **Calling hooks conditionally** — *Symptom:* If a hook runs after an early return, React throws 'Rendered fewer hooks than expected' and the tree crashes. *Fix:* Hooks must run unconditionally in the same order every render — move early returns below all hooks, extract the conditional part into a component.
9. **Client Components by default in RSC apps** — *Symptom:* Whole app ships as JS because every file starts with 'use client'. *Fix:* Only leaf interactive components are client. Layouts, data fetching, and static content stay server components; pass serializable props down.

## Production / Interview Quick Reference

- Learning path Nov 2026: react.dev learn → build with Vite/Next 16 → React Compiler (stable) → Testing Library + Playwright. `learning`
- React 19 (Dec 2024) made Actions, useActionState, useOptimistic, useFormStatus, ref-as-prop, and Document Metadata stable; 19.3 (Sep 2026) added <ViewTransition/> and the browser() react-dom entry. `version`
- State of JS 2025: 85% usage among front-end framework users, 72% satisfaction. npm: ~253M weekly downloads — an order of magnitude above every other UI library. `usage`
- Server Components render on the server, never hydrate, and ship zero JS; Client Components hydrate and own state. The boundary is the 'use client' directive. `rsc`
- setX updates are batched automatically (React 18+) — multiple setX in one handler cause one render. Automatic batching applies inside promises and timeouts too. `behavior`
- React Compiler (v1.0 stable since Oct 2025) auto-memoizes components — the long-term answer to manual useMemo/useCallback everywhere. `version`
- Strict Mode double-invokes render+effects in dev to surface impure functions and missing cleanup — never disable it to 'fix' double fetches. `debug`
- Keys must be stable and unique among siblings — they are identity, not ordering. crypto.randomUUID() for new items; never Math.random(). `gotcha`
- Error boundaries catch render errors in a subtree — class components with componentDidCatch, or react-error-boundary. They do NOT catch event handlers or effects. `error`
- Hydration mismatch = server HTML differs from first client render. Causes: Date.now(), Math.random(), locale-dependent formatting during render. `debug`
- Suspense works for lazy() AND for thrown-then-resolved promises (RSC / React 19 use()). Fallback replaces the whole subtree while pending. `rsc`
- Tearing = different parts of the UI show different state after an update; concurrent React prevents it by committing renders atomically. `behavior`
- Profiler flame graph in React DevTools is the ground truth for re-render cost — flamegraph + 'why did this render' beats guessing. `debug`
- React's test story: React Testing Library (query by role/label, user-event), Vitest/Jest runner. Test behavior, not internals. `test`
- ForwardRef is dead code in React 19 — ref is now a regular prop. Remove forwardRef wrappers when upgrading. `migration`

## Go Deeper

- [react.dev — Official Docs](https://react.dev/learn) — The rewritten docs (2023+) are the best learning resource in frontend; start with 'Thinking in React' and 'You Might Not Need an Effect'.
- [React Working Group — Discussions](https://github.com/reactwg/react-19) — Design notes and upgrade guides straight from the React team.
- [New React Documentation — Server Components](https://react.dev/reference/rsc/server-components) — The RSC mental model, the client/server boundary, and what serializes across it.
- [TanStack Query docs](https://tanstack.com/query/latest) — The standard client-side async-state layer: caching, dedupe, retries, invalidation.
- [React Compiler (React blog)](https://react.dev/learn/react-compiler) — How automatic memoization works and how to adopt it incrementally.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| props: string \| number \| boolean | Serializable primitives — render as text; simplest to pass across the RSC boundary. | Labels, ids, flags, counts. |
| enum-ish: 'small' \| 'medium' \| 'large' | String literal unions — the de facto enum for variant props. | Variant APIs. TypeScript gives exhaustiveness checking in switch. |
| React.ReactNode | Anything renderable: element, string, null, fragment, array, portal. | children and render-slot props. |
| key: React.Key | Stable identity for list reconciliation (string \| number \| bigint). | Map keys; must be unique among siblings, stable across renders. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| items.map(x => <Row key={x.id} .../>) | Rendering lists — map returns elements; React reconciles by key. | Any collection render. Filter/sort the array, not the DOM. |
| Array.prototype.reduce for grouped UI | Group rows by bucket into an object of arrays before render. | Grouped lists — cheaper than nested filters per group. |
| Set/Map in state | Reference types — replace, don't mutate (new Set([...s, x])). | Selections, tags, dedupe. Fast membership checks. |
| Record<string, T> lookups | Object map by id — O(1) access instead of arr.find(). | Normalized entity state (the Redux/RTK pattern). |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| type Props = { title: string; onClose: () => void } | The component contract — checked by TypeScript at every call site. | Every component. Prefer specific types over React.FC (implicit children gotcha). |
| type Reducer<S, A> | Pure (state, action) => state function — the state machine pattern. | useReducer stores: multi-field, transition-heavy state. |
| interface CustomHook { data; isPending; error } | Async-state triple returned by data hooks (TanStack Query convention). | Any async hook API — callers render {isPending ? ... : data}. |
| Zod/infer schemas at boundaries | Parse untrusted input (forms, API) into typed values; infer the TS type. | Forms (react-hook-form + zod) and RSC action inputs. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| condition && <Badge/> | Renders Badge only when truthy. 0 renders '0', NaN renders 'NaN' — classic footgun. | Simple conditional presence. Guard counts: n > 0 && <List/>. |
| cond ? <A/> : <B/> | Ternary — inline branch in JSX. | Two-way UI branches. Nested ternaries: extract a component. |
| null / undefined / false | Render nothing — the only falsy values JSX ignores. | Early returns for guards: if (!user) return null. |
| {...props} spread | Forwards all props; order matters — later keys win. | Wrapper components. Spread explicit rest (...rest) to avoid leaking internals to the DOM. |
| ?? (nullish) vs \|\| (or) | ?? falls back only on null/undefined; \|\| also on 0/''/false. | Default values where 0 or '' are valid (pageSize ?? 10, not \|\|). |
| ?., optional chaining | Safe deep access user?.address?.city — undefined instead of throw. | Data from APIs and partially-loaded RSC payloads. |

## Input / Output

**Data in: props drilling vs composition**

```javascript
// Prop drilling — 3 intermediate components pass user they don't use
<Page user={user} /> → <Sidebar user={user} /> → <Avatar user={user} />

// Composition inversion — Page owns data, slots the display
function Page() {
  const user = useCurrentUser();
  return <Sidebar><Avatar user={user} /></Sidebar>;
}

// Context — for genuinely ambient data (auth, theme, locale)
const UserCtx = createContext(null);
<UserCtx.Provider value={user}><DeepTree/></UserCtx.Provider>
// In DeepTree: const user = useContext(UserCtx);
```

**Data out: controlled vs uncontrolled inputs**

```javascript
// Controlled — React state is the source of truth (validation-friendly)
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
// React 19: <form action={fn}> + FormData replaces most controlled forms.
```

**Server actions: mutations with progressive enhancement**

```javascript
"use server";
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
}
```

## Loops & Iteration

**Lists, groups, and grids**

```javascript
// Flat list — stable keys, no index
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
));
```

**Slot/child iteration and fragment keys**

```javascript
// Children utilities — mapping over slot content
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
));
```

## Functions & Callables

**Component as closure — props are the arguments**

```javascript
// A component IS a function: props in, UI out. Pure = same props,
// same UI. Everything else (effects, refs) is escape hatch.
function Badge({ count, max = 99, tone = "neutral" }) {
  const label = count > max ? max + "+" : String(count);
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

// HOCs are just higher-order functions over components
function withAuth(Component) {
  return function AuthGate(props) {
    const user = useCurrentUser();
    if (!user) return <LoginPrompt />;
    return <Component {...props} user={user} />;
  };
}
```

**Custom hooks — stateful logic extraction**

```javascript
// Hooks compose: a hook can call other hooks. That's the whole trick.
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
}
```

**Render props and headless components**

```javascript
// Headless hook pattern (TanStack Table style) — logic without markup
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
<th onClick={() => toggle("name")}>Name {sort.key === "name" ? sort.dir : ""}</th>
```

## Error Handling

**Error boundaries + reset keys**

```javascript
import { ErrorBoundary } from "react-error-boundary";

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
// in try/catch or use TanStack Query's error state.
```

**Async errors: suspense for load, boundary for failure**

```javascript
// Load state = Suspense fallback; failure = error boundary retry.
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
// { error: "rate_limited" } rendered inline via useActionState.
```

## Concurrency Model

**Transitions: urgent vs non-urgent updates**

```javascript
function FilterableList({ items }) {
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
// one renders — interruptible by design, no more frozen inputs.
```

**Streaming with Suspense boundaries**

```javascript
// Route shell streams immediately; slow sections arrive when ready.
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
// with the slow subtree (not one spinner for the whole page).
```

**useSyncExternalStore: tearing-proof external state**

```javascript
// For stores outside React (zustand, redux, URL, window)
const width = useSyncExternalStore(
  (cb) => window.addEventListener("resize", cb),   // subscribe
  () => window.innerWidth,                          // client snapshot
  () => 0                                           // server snapshot
);
// Guarantees a consistent snapshot across concurrent renders —
// hand-rolled subscription + state WILL tear.
```

## Testing Patterns

**Behavior-first component tests (RTL + Vitest)**

```javascript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("shows remaining chars while typing", async () => {
  const user = userEvent.setup();
  render(<BioField max={100} />);

  await user.type(screen.getByRole("textbox", { name: /bio/i }), "hello");

  expect(screen.getByText("95 left")).toBeVisible();
});

// Query by role/label/text the way a user perceives the UI —
// getByTestId is the last resort. user-event over fireEvent
// (fires focus, keydown, input — the real browser sequence).
```

**MSW: mock at the network boundary**

```javascript
import { http, HttpResponse, setupServer } from "msw/node";

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
// component tests stay free of fetch plumbing entirely.
```

**E2E with Playwright**

```javascript
import { test, expect } from "@playwright/test";

test("checkout flow", async ({ page }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();

  await page.getByLabel("Card number").fill("4242424242424242");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.getByText("Order confirmed")).toBeVisible();
});
// E2E is for critical flows only (checkout, auth, core funnel) —
// keep the pyramid shape: many unit, some integration, few E2E.
```

## Performance Tuning

- Measure with React DevTools Profiler flame graph before optimizing anything — 'why did this render' beats intuition every time.
- The default fix is moving state down / lifting content up (composition), not memo(). Fewer re-renders beats faster re-renders.
- List virtualization (TanStack Virtual) keeps 100k-row tables at 60fps — render only visible rows + overscan.
- Route-level code splitting via lazy()/Suspense or framework routers; measure bundle impact with @next/bundle-analyzer or source-map-explorer.
- Images are the biggest bytes on most pages: next/image-style responsive sizes, AVIF/WebP, explicit width/height to kill CLS.
- Server Components remove client JS wholesale — the fastest code is the code you never ship.
- Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. INP replaced FID in Core Web Vitals (2024).
- useTransition/useDeferredValue keep input responsive on expensive renders — interruptible rendering is free if you opt in.
- Keys that stay stable across reorderings prevent subtree remounts — the cheapest perf fix in React.
- Debounce expensive work on user input (search), but keep the input itself uncontrolled or urgent-updated.
- React Compiler auto-memoizes components — removes most manual useMemo/useCallback in app code (stable since Oct 2025).
- Hydration cost scales with client-component tree size; push 'use client' to the leaves.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Next.js](https://nextjs.org/docs) | The dominant React framework: App Router RSC, routing, SSR/SSG, caching. Current: 16.4.x. | framework |
| [TanStack Query](https://tanstack.com/query/latest) | Async state: caching, dedupe, retries, optimistic updates. The client-data standard. | data |
| [TanStack Router / React Router 7](https://tanstack.com/router/latest) | Type-safe routing; React Router 7 merged Remix features. | routing |
| [Zustand / Redux Toolkit](https://zustand.docs.pmnd.rs/) | Client state stores. Zustand for lean apps; RTK for heavy normalized state. | state |
| [react-hook-form + Zod](https://react-hook-form.com/) | Performant forms with schema validation — the 2026 default stack. | forms |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling — pairs naturally with component composition. Current: 4.3.x. | styling |
| [shadcn/ui](https://ui.shadcn.com/) | Copy-paste accessible component patterns on Radix + Tailwind — the ecosystem default kit. | ui |
| [Vite](https://vite.dev/) | Dev server + bundler for SPA React apps (behind Next.js for full-stack). Current: 8.3.x. | build |
| [Vitest + React Testing Library](https://vitest.dev/) | Unit/behavior tests with jsdom; MSW for network mocking. | test |
| [Playwright](https://playwright.dev/) | Cross-browser E2E; trace viewer makes failures debuggable. | test |
| [Storybook](https://storybook.js.org/) | Component workshop: isolated dev, visual tests, docs. | test |
| [Biome](https://biomejs.dev/) | Rust-based lint+format for JS/TS — the fast alternative to ESLint+Prettier. | lint |
| [React DevTools](https://react.dev/learn/react-developer-tools) | Profiler + component tree inspector; the first tool you open. | debug |
| [rsbuild / Rspack](https://rspack.dev/) | Rust bundlers for large SPAs where Vite's dev scales thin. | build |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.3 / open source | 2013 | Jordan Walke's FaxJS prototype becomes React, open-sourced at JSConf US — initial reception hostile to JSX and inline HTML. |
| 16.8 | 2019 | Hooks — useState/useEffect let function components own state and effects; class components begin their long retirement. |
| 16.13 / 17 | 2020 | Event delegation refactor, new JSX transform (no React import), gradual rollout groundwork for concurrent features. |
| 18 | 2022 | Concurrent renderer, automatic batching, Suspense on the server, streaming SSR, useTransition/useDeferredValue/useId. |
| 19 | 2024 | Actions + useActionState/useOptimistic/useFormStatus, ref-as-prop, Document Metadata, cleanup-function refs, React Compiler preview. |
| 19.1 | 2025 | ViewTransition types, Activity component, use aggregate View; React Compiler beta in Next.js. |
| 19.3 | 2026 | <ViewTransition/> component stable, Fragment refs, browser() react-dom entry, Trusted Types integration. |

## Interview Hot Questions

1. **What's the difference between state and props?** *(easy)*

   Props are read-only inputs passed from the parent — configuration from the outside. State is data the component owns and can change over time. A component shouldn't mutate its props; changing state is the one sanctioned way to trigger re-renders. When two components need the same mutable data, that state moves to their closest common ancestor (lifting state up).

2. **Why must hooks be called unconditionally at the top level?** *(medium)*

   React tracks hooks per component by call order — it stores hook state in a linked list indexed by position. Conditional hooks shift positions, so React reads state belonging to another hook, corrupting the tree ('rendered fewer hooks than expected'). The rule follows from the implementation, not style: same order every render or state gets mismapped.

3. **When do you actually need useEffect?** *(medium)*

   Only to synchronize with systems outside React: subscriptions, timers, imperative DOM APIs, logging beacons, integrating non-React widgets. If the effect computes data for render (derived state), syncs two pieces of React state, or handles user events, it's the wrong tool — compute during render, or handle events in handlers. The docs essay 'You Might Not Need an Effect' is the canonical answer.

4. **Explain reconciliation and the role of keys.** *(medium)*

   On state change React builds a new element tree and diffs it against the old one: same type at the same position → reuse the DOM node and update props; different type → destroy and remount the subtree. Lists reconcile by key: matching keys keep component state and DOM across reorders. Index keys break this — sorting moves state to the wrong rows — hence 'stable unique ids'.

5. **What problem do React Server Components solve?** *(medium)*

   RSC moves rendering of data-heavy/static parts to the server with zero hydration cost: components run there, fetch directly (no API hop), and ship serialized output instead of component code. Client components hydrate only the interactive leaves. The win is bundle size and data locality — a product page renders from the DB with the JS cost of only its buttons and forms.

6. **How does concurrent rendering change update semantics?** *(hard)*

   Since 18, renders are interruptible: React can pause a low-priority render to handle input, then resume or discard it. Updates are split into urgent (input.value) and transition-wrapped (filtered results). This eliminates the 'frozen page during expensive render' failure mode and enables Suspense streaming — at the cost of render purity being strictly enforced (Strict Mode double-invokes to catch violations).

7. **Why is prop drilling not always bad, and what are the alternatives?** *(medium)*

   Passing props through a few levels is explicit data flow — easy to trace and refactor; reach for context or state libraries only when drilling crosses many uninterested components. Alternatives in order of preference: composition (children as slots), lifting state differently, context for ambient data (theme/auth), and component/store libraries (Zustand, Jotai) for truly shared client state. Context re-renders every consumer on value change, so it's not a free global.

8. **Controlled vs uncontrolled inputs — when each?** *(easy)*

   Controlled: React state mirrors the input on every keystroke — needed for live validation, conditional UI, formatting. Costs a render per keystroke (fine for forms, measurable for huge tables of inputs). Uncontrolled: DOM holds the value; read via ref on submit — cheaper and simpler for plain forms. React 19's form actions lean uncontrolled: the form owns its data in FormData and the action handles submission.

9. **What is hydration, and what causes hydration mismatches?** *(medium)*

   Hydration attaches event listeners and state to the server-rendered HTML so it becomes interactive — React replays the render on the client and 'adopts' the existing DOM. Mismatch = client first render differs from server HTML: caused by Date.now(), Math.random(), locale/timezone formatting, or browser-only APIs during render. React downgrades to client re-render (losing SSR benefits) or errors — fix by moving non-deterministic values to effects or ensuring server/client render identical output.

10. **How would you diagnose and fix a slow React page?** *(hard)*

   Reproduce, then React DevTools Profiler: record the interaction, read the flame graph — wide commits and 'why did this render' identify the expensive subtree and cause. Fixes in order of impact: move state down to the smallest subtree, split heavy renders with transitions, virtualize long lists, memo the boundary if referential instability is proven, code-split the route, and push static/data-heavy parts to server components. Never memo blindly — each memo has a comparison cost.

## When to Choose This

- **vs Vue:** use this — Largest ecosystem and hiring pool, deep AI-tool support, best fit for complex stateful apps with big teams and long lifetimes.; use that — Gentler learning curve with official router/state/style guides in one package; template syntax preferred by design-adjacent teams. 52% usage in State of JS 2025 — massive but smaller.
- **vs Svelte:** use this — You want the mature ecosystem, explicitness at scale, and the option of RSC server rendering; hiring at volume.; use that — Smaller runtime (compiler does the work), nicer defaults for small-to-mid interactive sites; highest retention (86%) but ~27% usage and a thinner component/job market.
- **vs Angular:** use this — UI library philosophy — pick your own router/state/styling; best for product teams iterating fast.; use that — Full opinionated framework with DI, forms, and strict conventions — favored in large enterprise/regulated shops with Java/.NET heritage.
- **vs Solid:** use this — Ecosystem gravity and RSC path; React knowledge transfers everywhere.; use that — Fine-grained reactivity (no VDOM) with the highest satisfaction (89% five years running) — for performance-first apps that accept a smaller community.
- **vs HTMX/server-rendered:** use this — Rich client state: editors, dashboards, drag-drop, optimistic multi-widget sync.; use that — Server-rendered HTML with hypermedia interactivity — drastically less JS for CRUD apps where the server already owns the state.

