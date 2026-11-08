# Objective-C

**Category:** Languages · **Tier:** Tier 3 · Specialized · **Tags:** dynamic, compiled, c-superset, smalltalk-inspired, apple, message-passing, cocoa · **First released:** 1984 · **Author:** Brad Cox & Tom Love · **Last updated:** 2026-11

> Smalltalk-style message passing layered over C — Apple's lingua franca for Cocoa until Swift arrived.

---

## TL;DR

- Objective-C is a thin object layer bolted onto C: every method call is a runtime message send (`objc_msgSend`) dispatched through a class's method table, and the object model is borrowed wholesale from Smalltalk.
- It dominated macOS, iOS, iPadOS, and the entire Cocoa/Cocoa Touch stack from the NeXTSTEP era (1989) until Swift replaced it as the default in 2014; the frameworks you call (UIKit, Foundation) are still implemented in ObjC and bridged to Swift.
- Reach for Objective-C when maintaining legacy Cocoa codebases, writing C-compatible public APIs that Swift can't express, debugging framework internals, or interfacing with the Objective-C runtime directly (KVO, swizzling, dynamic subclasses).
- Avoid it for greenfield Apple apps — Swift is faster to write, memory-safe, and the default since Xcode 6. New ObjC should be reserved for header files, C++ interop, and runtime surgery.

## Core Mental Model

**Messages to objects, not calls to functions.** An ObjC method invocation `[obj doThing:1 with:2]` compiles to `objc_msgSend(obj, sel_doThing_with_, 1, 2)` — a C function that looks up the selector in obj's class (and its superclasses), then jumps. The receiver can be nil (the message is silently swallowed), the selector can be unknown (you get forwarding via `forwardingTargetForSelector:` / `forwardInvocation:`), and you can rewire the dispatch table at runtime (swizzling, ISA-swapping). The C underneath still owns memory, pointers, and structs — ARC handles retain/release for ObjC objects but does nothing for malloc'd buffers or CoreFoundation toll-free bridging.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| @interface Foo : NSObject <NSCopying> @end | Declares a class with superclass and adopted protocols; methods go in @implementation. | Public header contract — what other files see. |
| - (void)drawIn:(NSRect)r; + (instancetype)shared; | `-` instance method, `+` class method;instancetype returns the receiver's type for subclasses. | Every method declaration — there are no free functions in the object model. |
| [obj doThing:x with:y] | Message send — compiles to objc_msgSend; nil receiver returns zero/nil silently. | All method calls; this is the syntax, not a wrapper. |
| @property (nonatomic, copy) NSString *name; | Generates getter/setter + ivar; `copy` for NSStrings, `strong`/`weak` for object graphs. | Declared state — almost always prefer over raw ivars. |
| obj.name  // == [obj name] | Dot syntax calls the getter/setter — not field access. | Property access; reads identically to message send. |
| @autoreleasepool { ... } | Delimits an autorelease pool drain scope — needed in tight loops creating many temporaries. | Non-ARC code, or ARC code that allocates millions of objects in a loop. |
| id<NSFastEnumeration> seq | Typeless object that adopts a protocol — dynamic typing + protocol contract. | Collections, delegates, anything polymorphic. |
| __weak typeof(self) weakSelf = self; | Breaks retain cycles in blocks capturing self. | Every block that outlives the current scope and references self. |
| @try { ... } @catch (NSException *e) { ... } | Exception handling — only for truly exceptional programmer errors, NOT normal control flow. | Catching programming bugs; Cocoa reserves exceptions for unrecoverable contract violations. |
| dispatch_async(queue, ^{ ... }); | GCD — submit a block to a queue; the canonical ObjC concurrency primitive. | Background work, main-thread hops, serialization queues. |
| [NSObject respondsToSelector:@selector(foo:)] | Duck-typing probe via the runtime — true if the class implements the selector. | Optional protocol methods, informal protocols, defensive interop. |
| CFBridgingRelease / __bridge_transfer | Toll-free bridge between CoreFoundation (C) and Foundation (ObjC) under ARC. | Interfacing with CF types like CFString / CFArray. |

## Idiomatic Patterns

**Modern class with ARC, designated initializer, and NSCopying**

```objective-c
// Foo.h
@interface Foo : NSObject <NSCopying>
@property (nonatomic, copy, readonly) NSString *name;
@property (nonatomic, assign, readonly) NSInteger count;
- (instancetype)initWithName:(NSString *)name count:(NSInteger)count NS_DESIGNATED_INITIALIZER;
@end

// Foo.m
@implementation Foo {
    NSInteger _count;  // backing ivar — ARC-managed for objects
}
- (instancetype)initWithName:(NSString *)name count:(NSInteger)count {
    if ((self = [super init])) {
        _name = [name copy];   // copy for immutable NSString
        _count = count;
    }
    return self;
}
- (instancetype)init { return [self initWithName:@"" count:0]; }
- (id)copyWithZone:(NSZone *)zone { return [Foo allocWithZone:zone]; }  // immutable -> share
@end
```

**GCD + weakSelf pattern — the canonical async block**

```objective-c
- (void)fetchThenRender {
    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSData *data = [self fetchSync];   // strong ref captured here
        __strong typeof(weakSelf) strong = weakSelf;
        if (!strong) return;               // dealloced while we were working
        dispatch_async(dispatch_get_main_queue(), ^{
            [strong render:data];
        });
    });
}
```

**Block as completion handler — error-by-convention**

```objective-c
typedef void (^FetchCompletion)(NSData *data, NSError *error);

- (void)fetchURL:(NSURL *)url completion:(FetchCompletion)handler {
    if (!handler) return;  // callers may pass nil
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSError *err = nil;
        NSData *d = [NSData dataWithContentsOfURL:url
                                          options:0
                                            error:&err];
        dispatch_async(dispatch_get_main_queue(), ^{
            handler(d, err);  // err is nil on success — convention, not enforced
        });
    });
}
```

**Fast enumeration + NSArray literals**

```objective-c
NSArray *users = @[@"alice", @"bob", @"carol"];
NSDictionary *ages = @{@"alice": @30, @"bob": @41};

NSMutableString *log = [NSMutableString string];
for (NSString *name in users) {           // NSFastEnumeration — O(n), no index math
    NSNumber *age = ages[name];           // nil-safe: missing key -> nil, not crash
    [log appendFormat:@"%@@%@\n", name, age];
}
NSLog(@"%@", log);
```

## Common Pitfalls

1. **Messaging nil silently does nothing** — *Symptom:* `[nil doThing]` returns 0/nil/NO/0.0 depending on return type instead of crashing — bugs hide as missing side effects and zeroed return values for pages. *Fix:* Assert on inputs you actually need: `NSParameterAssert(obj)`. Treat nil-eating as a Cocoa convention for collections and delegates, not a license to skip preconditions.
2. **Retain cycles via blocks capturing self** — *Symptom:* A block held by `self` (or a property of self) captures self strongly — dealloc never fires, memory leaks. *Fix:* Capture `__weak typeof(self) weakSelf = self` outside, then `__strong typeof(weakSelf) strong = weakSelf` inside to get a temporary strong ref for the block body.
3. **Using `copy` wrong on NSString properties** — *Symptom:* `@property NSString *name;` with no copy attribute — if a caller passes an NSMutableString and later mutates it, your stored name changes underneath you. *Fix:* Always `copy` for NSString, NSAttributedString, NSArray, NSDictionary. Use `strong` only when you explicitly want shared mutability.
4. **Exception handling is not for control flow** — *Symptom:* Throwing NSException inside Cocoa frameworks may leave the framework in an inconsistent state — unlike Java, ObjC code is not exception-safe past the throw point. *Fix:* Use NSError** out-parameters for recoverable errors. Reserve @try/@catch for programmer errors you intend to crash on in release builds.
5. **ISA swizzling and KVO observation order** — *Symptom:* KVO dynamically subclasses your class and overrides setters — calling `[super dealloc]` or `class_getInstanceSize` may surprise you, and removing the wrong observer crashes. *Fix:* Always pair `addObserver:forKeyPath:` with `removeObserver:forKeyPath:` in dealloc; prefer block-based KVO (`-observeValueForKeyPath:ofObject:change:context:` or the iOS 11 `NSObject` block API).
6. **Bridging CoreFoundation under ARC** — *Symptom:* `CFStringRef s = (__bridge CFStringRef)nsString;` works, but `CFRelease(s)` afterwards double-frees; forgetting `__bridge_transfer` leaks. *Fix:* `__bridge` for a no-op cast, `__bridge_retained` to give ARC's ownership to CF (then you must CFRelease), `__bridge_transfer` to give CF ownership back to ARC.
7. **Category method name collisions** — *Symptom:* Two categories on NSObject define `-myHelper` — which one wins is undefined and changes between builds, producing impossible-to-debug crashes. *Fix:* Prefix category methods (`myco_myHelper`), never override existing methods in a category (subclass instead), and add `+load` only for setup that must run before main().

## Production / Interview Quick Reference

- All message sends compile to objc_msgSend (or a variant like objc_msgSend_stret for large struct returns) — there is no static dispatch in the object model. `perf`
- isa pointer (8 bytes) + refcount + ivars per instance — minimum object size is 16 bytes on arm64. `complexity`
- ARC was introduced with Xcode 4.2 / iOS 5 (2011); pre-ARC code uses retain/release/autorelease manually. `version`
- Swift's `AnyObject` and `id` are bridged; pure Swift classes inherit from NSObject only when marked `@objc` or descending from NSObject. `version`
- Method lookup is cached in a class's method cache after first send — subsequent calls are ~3-5ns; cold sends are ~50-100ns due to table walk. `perf`
- nil messaging returning a struct is implementation-defined on arm64 — only scalar/pointer returns are guaranteed nil-safe. `gotcha`
- Property `atomic` (default) adds a lock per access; `nonatomic` skips it. Cocoa code uses `nonatomic` almost everywhere because atomicity ≠ thread safety. `gotcha`
- Blocks are stack-allocated by default — `^{...}` escapes the scope unless you copy them (`[block copy]` or assign to a `copy` property). ARC copies blocks on capture for you. `gotcha`
- @selector(foo:) is resolved at load time; runtime swizzling changes the IMP behind it. `complexity`
- Foundation's collection classes are class clusters — `[[NSArray alloc] init]` returns __NSArrayI, not NSArray. Never hardcode subclass names. `gotcha`
- Toll-free bridging: CFString ↔ NSString, CFArray ↔ NSArray, CFDictionary ↔ NSDictionary share the same ISA in Foundation. `perf`
- Swift ABI has been stable since Swift 5 (2019); ObjC interop is now the long-term ABI floor for Apple platforms. `version`
- Coding style: prefix class names with 2-3 capital letters (NS, UI, CF) — Apple reserves the underscore prefix. `style`
- Header (.h) is the public contract; implementation (.m) holds the code. Use class extensions (anonymous @interface in .m) for private state. `style`
- Modern code uses nullability annotations (`nullable`, `nonnull`, `null_resettable`) — these bridge to Swift optionals. `version`

## Go Deeper

- [The Objective-C Programming Language (Apple)](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/) — Apple's canonical conceptual guide — read the Messaging and Encapsulating Data chapters.
- [Objective-C Runtime Programming Guide](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/) — The runtime reference — objc_msgSend, swizzling, dynamic subclassing, KVO internals.
- [objc-runtime source (Apple open source)](https://opensource.apple.com/source/objc4/) — The actual implementation of objc_msgSend, class registration, and ARC entry points.
- [Effective Objective-C 2.0 (Matt Galloway)](https://www.oreilly.com/library/view/effective-objective-c/9780133391779/) — 52 specific items — the closest analog to Effective C++ for the Cocoa world.
- [Cocoa Design Patterns (Erik Buck)](https://www.oreilly.com/library/view/cocoa-design-patterns/9780321573040/) — Explains why the frameworks look the way they do: class clusters, delegates, responders, invocations.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| id | Pointer to any ObjC object — no static type info, all dispatch is runtime. | Collections of mixed types, delegates, dynamic APIs. Bridged to Swift's 'AnyObject' / 'Any'. |
| instancetype | Type of the receiving class for subclass-friendly init/factory methods. | All init, alloc, factory returns. Compiler-checked covariant return; preferred over 'id' for constructors. |
| Class | Object representing a class itself; obtained via [Foo class] or NSStringFromClass. | Reflection, factory patterns, KVO internals. isa pointer points here. |
| SEL | Opaque type representing a selector (method name) — interned string, O(1) compare. | @selector(foo:), target/action, dynamism. Resolved to IMP by the runtime. |
| IMP | Function pointer to a method's implementation — the C function objc_msgSend dispatches to. | Method swizzling, fast-path caching, bypassing the dispatch table. |
| BOOL | typedef signed char (NOT stdbool _Bool) — YES=1, NO=0. Watch: any non-zero char != YES. | Predicates, success flags. Compare with == YES only if you are sure the value is 0 or 1. |
| NSInteger / NSUInteger | Architecture-sized int (32 or 64 bit) — bridged to Swift's Int/UInt. | All integer math; never use raw 'int' in modern ObjC, it breaks 64-bit clean. |
| CGFloat | typedef double on 64-bit, float on 32-bit — Core Graphics' float type. | All drawing/geometry; matching the framework's type avoids implicit conversions. |
| NSRange | C struct {location, length} — NOT a class. Use NSMakeRange or NSMakeRange-encoded literals. | String/range slicing, regex matches, text selection. Pass by value. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| NSArray / NSMutableArray | Ordered, immutable/mutable collection of objects; nil-terminated literal @[@1, @2]. | Ordered lists of objects. Class cluster — never subclass; use NSMutableArray for mutability. |
| NSDictionary / NSMutableDictionary | Keyed map — keys must be NSCopying; literal @{k: v}. | JSON-like data, caches. Insertion-ordered? No — use NSOrderedSet or rely on allKeys enumeration. |
| NSSet / NSMutableSet | Unordered, unique objects — O(1) membership via hash. | Dedup, membership tests, set algebra (union/intersect/minus). |
| NSOrderedSet / NSMutableOrderedSet | Hybrid — unique elements + insertion order. Slower than NSArray but de-dupes. | When you need both ordering and uniqueness (e.g., tagged items, ordered configs). |
| NSIndexSet | Sorted set of NSUIntegers — space-efficient for ranges (stores [a,b] not a..b). | Table view selections, batch operations, sparse index lists. |
| NSData / NSMutableData | Byte buffer — wraps raw bytes; bridged to Swift Data. | Binary I/O, hashing, serialization. Use with NSInputStream/NSOutputStream for streaming. |
| NSValue | Box for C structs (NSRect, NSPoint, NSRange) — objects you can put in collections. | Storing CG types in arrays. NSNumber is the scalar specialization. |
| NSNumber | Box for scalars — @1, @YES, @3.14 literals. Bridged to CFNumber. | Putting numbers in arrays/dicts. Use NSNumber Literals (@) over [NSNumber numberWithInt:]. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| @interface Foo : Bar <P1, P2> | Class declaration with superclass + adopted protocols; state via @property. | All public class contracts. Header (.h) file. |
| @protocol P <P_base> | Protocol — interface any class can adopt; @required (default) and @optional methods. | Delegates, data sources, plugin contracts. Optional methods require respondsToSelector: checks. |
| @interface Foo (Category) | Category — add methods to any class (even ones you don't own); no ivars, no new state. | Utility methods, framework extension. Prefix names to avoid collisions (myco_helper). |
| @interface Foo () { ... } | Class extension (anonymous category in .m) — private state + method decls visible only inside. | Private ivars, internal-only properties, hiding public readonly behind readwrite private. |
| typedef NS_ENUM(NSInteger, Style) | Typed enum (NS_ENUM for scalar, NS_OPTIONS for bitmask). | Closed value sets; bridges to Swift enum cleanly (vs raw enum which bridges as Int). |
| typedef ReturnType (^Name)(ArgTypes) | Block type alias — blocks are closure objects on the heap (under ARC). | Callbacks, completion handlers, GCD. Use copy property for stored blocks. |
| @interface Foo : NSObject <NSCopying> | Value class implementing copyWithZone: — required for use as NSDictionary keys. | Immutable value types; pair with @property (copy) for safety. |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| [obj msg:arg] | Message send — compiles to objc_msgSend(obj, sel, arg). Nil-safe for scalar returns. | All method calls; this IS the syntax, not a wrapper. |
| obj.prop  // [obj prop] | Dot syntax — calls the accessor, not field access. Setter: obj.prop = x. | Property read/write; identical bytecode to bracket form. |
| @1, @"hi", @[] | Boxed expressions — NSNumber/NSString/NSArray literals (Clang extension, Xcode 4.4+). | Modern literal syntax; replaces [NSNumber numberWithInt:1] etc. |
| a == b | Pointer equality — compares object identity, NOT values. | Identity checks. For value equality use [a isEqual:b] or isEqualToString:. |
| [a isEqual:b] | Value equality — NSObject default is identity; NSString/NSNumber/NSArray override. | All value comparisons. Override isEqual: together with hash. |
| a ?: b | Nil-coalesce — returns a if non-nil, else b (GCC extension). | Default values: obj.name ?: @"unknown". Cleaner than ternary with nil check. |
| obj && obj.x | Short-circuit logical AND — left-to-right; second operand only evaluated if first is truthy. | Guard chains. nil is falsy, all other objects truthy. |
| a, b, c  (comma) | Sequence — evaluates all, returns last. Rare in idiomatic ObjC. | for-loop init/update; otherwise avoid. |
| &obj, *ptr | Address-of / dereference — same as C. ObjC objects are always pointers already. | C interop, NSError** out-params, struct pointers. |
| obj->ivar | Direct ivar access — bypasses accessors; only works on your own class's ivars (or @public). | Inside init/dealloc to avoid triggering accessor side effects; otherwise discouraged. |
| a ? b : c | Ternary — returns nil-safe: nil as condition is false. | Concise conditionals; nesting hurts readability. |
| @YES, @NO | Boxed BOOL — produces NSNumber (not a true boolean object). | Putting bools in collections; [flag boolValue] to unwrap. |
| a ^ b, a \| b, a & b | Bitwise — operate on integer types only (NSInteger, NSUInteger, etc.). | Flag masks, NS_OPTIONS enums. |
| a << n, a >> n | Bit shift — unsigned logical; signed arithmetic shift. | Bit-flag construction, hash mixing. |

## Input / Output

**Streaming file read via NSInputStream (memory-bounded)**

```objective-c
// Read a multi-GB file in 8KB chunks — never loads the whole file.
NSInputStream *stream = [NSInputStream inputStreamWithFileAtPath:path];
[stream open];

NSMutableData *buffer = [NSMutableData dataWithCapacity:8192];
uint8_t buf[8192];
while (stream.hasBytesAvailable) {
    NSInteger n = [stream read:buf maxLength:sizeof(buf)];
    if (n < 0) {
        NSError *e = stream.streamError;
        NSLog(@"read error: %@", e);
        break;
    }
    [buffer appendBytes:buf length:(NSUInteger)n];
    processChunk(buffer);
    [buffer setLength:0];   // reset for next chunk
}
[stream close];   // NSStreamDelegate for async variants
```

**JSON serialization with NSJSONSerialization**

```objective-c
// Encode: dict/array -> NSData
NSDictionary *payload = @{@"user": @"ada", @"id": @42, @"tags": @[@"a", @"b"]};
NSError *err = nil;
NSData *json = [NSJSONSerialization dataWithJSONObject:payload
                                              options:NSJSONWritingSortedKeys | NSJSONWritingPrettyPrinted
                                                error:&err];
// Write atomically — temp file + rename, avoids partial-write corruption.
[json writeToFile:@"out.json" options:NSDataWritingAtomic error:&err];

// Decode: NSData -> dict/array. Top-level MUST be array or dict.
NSData *raw = [NSData dataWithContentsOfFile:@"in.json"];
id parsed = [NSJSONSerialization JSONObjectWithData:raw
                                            options:NSJSONReadingFragmentsAllowed
                                              error:&err];
if (![parsed isKindOfClass:[NSDictionary class]]) {
    NSLog(@"unexpected JSON shape: %@", [parsed class]);
    return;
}
NSString *user = parsed[@"user"];   // nil-safe subscripting
```

**NSURLSession with delegate-based auth + retries**

```objective-c
NSURLSessionConfiguration *cfg = [NSURLSessionConfiguration defaultSessionConfiguration];
cfg.timeoutIntervalForRequest = 30;
cfg.HTTPAdditionalHeaders = @{@"User-Agent": @"MyApp/1.0"};

NSURLSession *session = [NSURLSession sessionWithConfiguration:cfg
                                                     delegate:self
                                                delegateQueue:nil];

NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
req.HTTPMethod = @"POST";
req.HTTPBody = [@"{"k":1}" dataUsingEncoding:NSUTF8StringEncoding];
[req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];

NSURLSessionDataTask *task = [session dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *resp, NSError *error) {
    NSHTTPURLResponse *http = (NSHTTPURLResponse *)resp;
    if (error || http.statusCode >= 400) {
        NSLog(@"fetch failed: %@ (status %ld)", error, (long)http.statusCode);
        return;
    }
    // Always hop to main queue before touching UI:
    dispatch_async(dispatch_get_main_queue(), ^{
        [self render:data];
    });
}];
[task resume];   // tasks start suspended; resume fires them
```

**Property list (plist) round-trip — typed config serialization**

```objective-c
// Only NSArray, NSDictionary, NSString, NSData, NSDate, NSNumber are plist-valid.
NSDictionary *cfg = @{@"endpoint": @"https://api.x", @"timeout": @30,
                      @"flags": @[@YES, @NO], @"version": [NSDate date]};

NSError *err = nil;
NSData *plist = [NSPropertyListSerialization dataWithPropertyList:cfg
                                                           format:NSPropertyListXMLFormat_v1_0
                                                          options:0
                                                            error:&err];
[plist writeToFile:@"cfg.plist" atomically:YES];

// Reading back — validate type before use, never trust the file shape.
NSData *raw = [NSData dataWithContentsOfFile:@"cfg.plist"];
NSPropertyListFormat fmt;
id obj = [NSPropertyListSerialization propertyListWithData:raw
                                                   options:NSPropertyListMutableContainers
                                                    format:&fmt
                                                     error:&err];
if (![obj isKindOfClass:[NSDictionary class]]) {
    [NSException raise:@"BadConfig" format:@"expected dict, got %@", [obj class]];
}
```

## Loops & Iteration

**Fast enumeration — the default for-in**

```objective-c
// NSFastEnumeration protocol: NSArray, NSDictionary, NSSet, NSRange.
// Single message send per batch (typically 16 items), no per-item overhead.
NSArray *users = @[@"alice", @"bob", @"carol"];
for (NSString *name in users) {
    NSLog(@"%@", name);
}

// Enumerating a dict yields KEYS, not values:
NSDictionary *ages = @{@"alice": @30, @"bob": @41};
for (NSString *key in ages) {
    NSNumber *age = ages[key];   // nil-safe subscripting
    NSLog(@"%@ -> %@", key, age);
}

// Mutating a collection during enumeration raises an exception.
// Build a list of keys to delete, then remove them after the loop.
```

**Enumerate with options — reverse, concurrent**

```objective-c
// NSEnumerationReverse — iterate back-to-front (e.g., safe mutation while removing).
NSMutableArray *items = [@[@1, @2, @3, @4] mutableCopy];
for (NSNumber *n in [items reverseObjectEnumerator]) {
    if (n.integerValue % 2 == 0) {
        [items removeObject:n];   // safe because we're going backwards
    }
}

// NSEnumerationConcurrent — parallel iteration across GCD queues.
[items enumerateObjectsWithOptions:NSEnumerationConcurrent
                        usingBlock:^(id obj, NSUInteger idx, BOOL *stop) {
    // Runs on background queues; *stop = YES to abort early.
    [self process:obj];
}];

// enumerateObjectsUsingBlock: (no options) — sequential, block gets (obj, idx, &stop).
```

**dispatch_apply — parallel counted loop with barrier**

```objective-c
// GCD parallel for-loop. Iterations run concurrently on a global queue;
// the call BLOCKS until all iterations finish. Don't call on the main queue.
NSArray *urls = [self fetchURLs];
dispatch_queue_t queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);

__block NSMutableArray *results = [NSMutableArray arrayWithCapacity:urls.count];
dispatch_apply(urls.count, queue, ^(size_t i) {
    NSData *d = [self fetchSync:urls[i]];
    @synchronized(results) {   // mutations need a lock — dispatch_apply is concurrent
        [results addObject:d ?: [NSNull null]];
    }
});
// 'results' is fully populated here — dispatch_apply is synchronous.
```

**NSEnumerator — explicit, composable**

```objective-c
// Older but still useful when you need the enumerator object itself.
NSEnumerator *e = [items objectEnumerator];
id obj;
while ((obj = [e nextObject])) {
    if (shouldSkip(obj)) continue;
    process(obj);
}

// reverseObjectEnumerator is a common alternative for safe-mutation loops.
// Compose with filteredEnumerator via NSPredicate for filtered iteration:
NSPredicate *p = [NSPredicate predicateWithFormat:@"age >= 30"];
NSArray *older = [users filteredArrayUsingPredicate:p];
```

## Functions & Callables

**Blocks — closures with ARC-managed capture**

```objective-c
// A block captures its enclosing scope. Under ARC, blocks are copied to
// the heap automatically when assigned to a strong variable.
typedef NSInteger (^Reducer)(NSInteger, NSInteger);

- (Reducer)makeAccumulatorFrom:(NSInteger)start {
    __block NSInteger acc = start;
    // __block lets the block mutate acc; without it acc is read-only const copy.
    return ^(NSInteger delta) {
        acc += delta;
        return acc;
    };
}

// Usage:
Reducer r = [self makeAccumulatorFrom:100];
r(5);   // 105
r(10);  // 115   -- captured state persists across calls
```

**Designated initializer chain + convenience inits**

```objective-c
@interface Vector : NSObject
@property (nonatomic, readonly) double x, y;
- (instancetype)initWithX:(double)x y:(double)y NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;   // forbid default init
@end

@implementation Vector
- (instancetype)initWithX:(double)x y:(double)y {
    if ((self = [super init])) {   // super init is the designated init of NSObject
        _x = x; _y = y;
    }
    return self;
}
@end

// Convenience init must call the designated init (self-init), not super.
// Subclasses override the designated init; convenience inits keep working.
```

**Variadic methods with va_list**

```objective-c
// Variadic — like C, no type info on the variable part. Use a sentinel.
- (void)logValues:(NSNumber *)first, ... NS_REQUIRES_NIL_TERMINATION {
    va_list args;
    va_start(args, first);
    for (NSNumber *n = first; n != nil; n = va_arg(args, NSNumber *)) {
        NSLog(@"%@", n);
    }
    va_end(args);
}

// Caller:
//   [logger logValues:@1, @2, @3, nil];
//
// NS_REQUIRES_NIL_TERMINATION makes the compiler warn if you forget the nil.
// For typed variadic (same type, count given), prefer NSArray literal @[@1,@2,@3].
```

**Selectors + IMP — dynamic dispatch tricks**

```objective-c
// Perform a selector dynamically — used by target/action, KVO, undo.
SEL sel = @selector(drawRect:);
if ([view respondsToSelector:sel]) {
    // objc_msgSend form for void-returning, single-arg message:
    ((void(*)(id, SEL, CGRect))objc_msgSend)(view, sel, bounds);
}

// Swap two method implementations (swizzling) — for AOP, debugging, mock frameworks.
Method m1 = class_getInstanceMethod([Foo class], @selector(original));
Method m2 = class_getInstanceMethod([Foo class], @selector_replacement));
method_exchangeImplementations(m1, m2);

// After this, calling -original runs -replacement and vice versa.
// Use sparingly — global, hard to debug, breaks expectations.
```

## Error Handling

**NSError** out-parameter — the Cocoa convention**

```objective-c
// Cocoa separates PROGRAMMER errors (exceptions) from RECOVERABLE errors (NSError).
// The convention: return a BOOL/nil for success, fill NSError** on failure.
- (nullable NSData *)fetch:(NSURL *)url error:(NSError **)outErr {
    NSData *d = [NSData dataWithContentsOfURL:url
                                      options:0
                                        error:outErr];
    if (!d && outErr) {
        // *outErr is already populated by dataWithContentsOfURL:error:
        return nil;
    }
    return d;
}

// Caller:
NSError *err = nil;
NSData *d = [self fetch:url error:&err];
if (!d) {
    NSLog(@"failed: %@ (code %ld)", err.localizedDescription, (long)err.code);
    // err.domain + err.code + err.userInfo drive recovery logic
}
```

**@try / @catch / @finally — exception handling**

```objective-c
// Exceptions in ObjC are for PROGRAMMER errors (broken invariants).
// They are slow (stack unwinding via DWARF) and frameworks may leak.
@try {
    [self mutateSharedState];
    if (bad) [NSException raise:@"BadState" format:@"invalid: %@", obj];
} @catch (NSException *e) {
    // e.name, e.reason, e.userInfo, e.callStackSymbols
    NSLog(@"caught %@: %@", e.name, e.reason);
} @finally {
    [self cleanup];   // always runs, even on @throw
}

// Don't use @try for normal control flow. NSError is the path for recoverable errors.
```

**Custom NSError domain + recovery attempter**

```objective-c
NSString *const MyErrorDomain = @"com.myapp";

- (BOOL)loadResource:(NSURL *)url error:(NSError **)err {
    if (!url) {
        NSDictionary *info = @{
            NSLocalizedDescriptionKey: @"missing URL",
            NSLocalizedRecoverySuggestionErrorKey: @"provide a non-nil url",
            NSUnderlyingErrorKey: ...   // chain if wrapping another error
        };
        *err = [NSError errorWithDomain:MyErrorDomain
                                    code:100
                                userInfo:info];
        return NO;
    }
    return YES;
}

// Recoverable errors: attach NSRecoveryAttempterErrorKey with an object
// implementing -attemptRecoveryFromError:optionIndex: — AppKit will offer
// the user recovery buttons in the standard error panel.
```

**Guarded resource lifecycle with cleanup block**

```objective-c
// No language-level 'defer', but a small helper class emulates it.
// Or use @finally directly. The pattern below is common for file/lock cleanup:

NSFileHandle *fh = [NSFileHandle fileHandleForReadingAtPath:path];
@try {
    NSData *d = fh.availableData;
    [self process:d];
} @catch (NSException *e) {
    NSLog(@"abort: %@", e);
    @throw;   // re-throw after logging
} @finally {
    [fh closeFile];   // guaranteed
}

// For ARC-managed resources, dealloc + cleanup is automatic. For
// malloc'd buffers, CFRelease, file descriptors — use @finally.
```

## Concurrency Model

**GCD — the canonical queues + dispatch_async**

```objective-c
// Three queue types: main (serial), global (concurrent, QoS-classed), private.
dispatch_queue_t bg = dispatch_get_global_queue(QOS_CLASS_UTILITY, 0);
dispatch_queue_t main = dispatch_get_main_queue();

__weak typeof(self) weakSelf = self;
dispatch_async(bg, ^{
    NSData *d = [self fetchSync];        // background, doesn't block UI
    __strong typeof(weakSelf) strong = weakSelf;
    if (!strong) return;                 // self dealloced while fetching
    dispatch_async(main, ^{
        [strong render:d];               // UI updates MUST be on main
    });
});

// Serial private queue — enforces mutual exclusion for shared state.
dispatch_queue_t workQ = dispatch_queue_create("com.myapp.work", DISPATCH_QUEUE_SERIAL);
```

**Dispatch semaphore — bounded concurrency**

```objective-c
// Limit concurrent network calls to avoid saturating the server.
dispatch_semaphore_t sem = dispatch_semaphore_create(10);
dispatch_queue_t q = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);

for (NSURL *url in urls) {
    dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);   // block if 10 in flight
    dispatch_async(q, ^{
        NSData *d = [self fetchSync:url];
        dispatch_async(dispatch_get_main_queue(), ^{
            [self render:d];
        });
        dispatch_semaphore_signal(sem);   // free a slot
    });
}
```

**Dispatch group — wait for a batch to finish**

```objective-c
dispatch_group_t group = dispatch_group_create();
dispatch_queue_t q = dispatch_get_global_queue(QOS_CLASS_UTILITY, 0);

for (NSURL *url in urls) {
    dispatch_group_enter(group);   // must be balanced with leave
    dispatch_async(q, ^{
        [self fetchSync:url];
        dispatch_group_leave(group);
    });
}

// Block until all enter/leave pairs balance:
dispatch_group_wait(group, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));

// Or schedule a completion on the main queue when done:
dispatch_group_notify(group, dispatch_get_main_queue(), ^{
    [self allDone];
});
```

**NSOperationQueue — cancellable, dependent, prioritized**

```objective-c
// Higher-level than raw GCD: cancellable, dependencies, max concurrency.
NSOperationQueue *q = [[NSOperationQueue alloc] init];
q.maxConcurrentOperationCount = 4;

NSBlockOperation *fetch = [NSBlockOperation blockOperationWithBlock:^{
    NSData *d = [self fetchSync];
    [self cache:d];
}];

NSBlockOperation *render = [NSBlockOperation blockOperationWithBlock:^{
    [self render:[self cached]];
}];
[render addDependency:fetch];   // render waits for fetch

[q addOperation:fetch];
[q addOperation:render];

// Cancellation is cooperative — check isCancelled inside the block:
//   if (op.cancelled) return;
```

## Testing Patterns

**XCTest — basic assertions and structure**

```objective-c
#import <XCTest/XCTest.h>
#import "Foo.h"

@interface FooTests : XCTestCase
@end

@implementation FooTests

- (void)setUp    { self.foo = [[Foo alloc] init]; }   // runs before each test
- (void)tearDown { self.foo = nil; }                  // runs after each test

- (void)testAdd {
    XCTAssertEqual(3, [self.foo add:1 to:2], @"add should work");
    XCTAssertTrue([self.foo isEmpty], @"should be empty initially");
    XCTAssertNil([self.foo optionalThing], @"returns nil by default");
    XCTAssertThrowsSpecificNamed([self.foo bad], NSException,
                                 @"BadState", @"should throw BadState");
}
@end
```

**Async test with expectations**

```objective-c
- (void)testFetchCompletes {
    XCTestExpectation *exp = [self expectationWithDescription:@"fetch returns"];

    [self fetch:^(NSData *data, NSError *err) {
        XCTAssertNil(err);
        XCTAssertGreaterThan(data.length, 0);
        [exp fulfill];   // mark the expectation as met
    }];

    // Wait up to 5 seconds; fails the test if exp isn't fulfilled.
    [self waitForExpectations:@[exp] timeout:5.0];
}

// For multiple async ops: create N expectations, fulfill each, wait once.
```

**Mocking with OCMock — stubbing and verifying**

```objective-c
// OCMock is the standard ObjC mocking library (third-party, CocoaPods).
id mock = OCMClassMock([NSURLSession class]);

// Stub a method to return canned data:
OCMStub([mock dataTaskWithRequest:OCMOCK_ANY completionHandler:OCMOCK_ANY])
    .andReturn(dummyTask);

// Verify a method was called with specific args:
OCMVerify([mock dataTaskWithRequest:[OCMArg checkWithBlock:^BOOL(id req) {
    return [req.URL.absoluteString isEqualToString:@"https://x"];
}] completionHandler:OCMOCK_ANY]);

// Argument constraints: OCMArg.any, OCMArg.isNil, OCMArg checkWithBlock:,
// OCMArg setValue:forKey: (mutate the arg in place).
```

**Performance test — measure block execution**

```objective-c
- (void)testSortPerformance {
    [self measureBlock:^{
        // XCTest runs this 5+ times, measures median + stddev, compares
        // against the baseline stored from a previous run.
        NSArray *sorted = [self.unsorted sortedArrayUsingSelector:@selector(compare:)];
        // The baseline is set in Xcode's Test Navigator; failures flag regressions.
        [sorted firstObject];   // prevent dead-code elimination
    }];
}

// measureMetrics:automaticallyStartMeasuring: for finer control over
// what's measured (clockTime, cpuTime, userTime, peakHeap, allocCount).
```

## Performance Tuning

- objc_msgSend is a few nanoseconds after the method cache warms (3-5ns typical on arm64); cold sends walking the class hierarchy are 50-100ns.
- Method cache is per-class, keyed by SEL; first send to a given selector on a class is slow, subsequent sends hit the cache (~98% hit rate in real apps).
- Tagged pointers: small NSNumbers/NSStrings/NSDate stored INSIDE the pointer, no allocation. @1, @"a" literals often don't allocate at all.
- ARC retain/release on strong properties compiles to objc_storeStrong / objc_retain calls — a few ns each; avoid in inner loops operating on millions of objects.
- Autorelease pools: temporary objects in a tight loop fill the pool until drain. Wrap in @autoreleasepool { ... } to bound peak memory.
- NSDictionary lookups are O(1) amortized but ~3-4x slower than a C++ std::unordered_map due toboxing and message sends on every key compare.
- NSArray subscripting (arr[0]) compiles to objectAtIndexedSubscript: — same as the explicit form; no perf difference, only syntax.
- NSString copy on @property is a copy for immutables (NSConstantString shares), a real copy for NSMutableString. Always declare copy for NSString to prevent mutable-subclass mutation.
- Class clusters (NSArray, NSString, NSDictionary) pick the most efficient concrete subclass at alloc time — __NSArrayI for immutable, __NSArrayM for mutable. Don't depend on concrete types.
- Fast enumeration sends one batch message per ~16 objects, not one per object — measure with Instruments' Time Profiler.
- Instruments: Time Profiler (CPU), Allocations (heap), Leaks (CFMalloc'd leaks), System Trace (scheduling/synchronization). All sample-based except Leaks.
- GCD dispatch_async has ~2us overhead; for sub-microsecond work batch inside one block. Serial queue dispatch_sync is ~0.5us.
- BOOL is signed char — comparing to YES fails for any non-1 truthy value. Always use if (flag) not if (flag == YES).
- isa pointer is 8 bytes on arm64 (non-pointer isa packs refcount/class bits); minimum object size is 16 bytes.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [Xcode](https://developer.apple.com/xcode/) | Apple's IDE — project files, Interface Builder, simulators, Instruments. Required for shipping iOS/macOS apps. | build |
| [CocoaPods](https://cocoapods.org/) | Centralized dependency manager (Podfile) — Ruby-based, mature, large registry. Most common in legacy codebases. | package |
| [Carthage](https://github.com/Carthage/Carthage) | Decentralized dependency manager — builds XCFrameworks, no project modification. Less magic than CocoaPods. | package |
| [Swift Package Manager (SPM)](https://www.swift.org/package-manager/) | Apple's official package manager; ObjC packages supported since Xcode 11. The future default. | package |
| [Instruments](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/) | Profiling suite bundled with Xcode — Time Profiler, Allocations, Leaks, System Trace, Core Animation. | debug |
| [LLDB](https://lldb.llvm.org/) | Default debugger in Xcode — po (print object), expr, watchpoint, condition breakpoints. Replaces GDB on Apple platforms. | debug |
| [XCTest](https://developer.apple.com/documentation/xctest) | Apple's unit/UI testing framework — assertions, expectations, performance metrics, UI tests via XCUITest. | test |
| [OCMock](http://ocmock.org/) | The standard mocking library for ObjC — stubs, class mocks, partial mocks, verification. | test |
| [Kiwi / Specta](https://github.com/kiwi-bdd/Kiwi) | BDD-style testing frameworks (RSpec-like). Largely superseded by Quick/Nimble in Swift-first codebases. | test |
| [Clang Static Analyzer](https://clang-analyzer.llvm.org/) | Built into Xcode (Analyze action) — finds retain cycles, null derefs, dead stores. scan-build for CI. | lint |
| [Clang-Format](https://clang.llvm.org/docs/ClangFormat.html) | Code formatter — LLVM / Google / WebKit / Mozilla / LLVM styles; configure via .clang-format. | lint |
| [Mantle / KZPropertyMapper](https://github.com/Mantle/Mantle) | Legacy model-serialization frameworks (Mantle from GitHub). Pre-dates Swift's Codable; still in old codebases. | build |
| [AFNetworking](https://github.com/AFNetworking/AFNetworking) | The classic networking library (NSURLConnection era). Largely replaced by NSURLSession in modern code. | build |
| [ReactiveObjC](https://github.com/ReactiveCocoa/ReactiveObjC) | Reactive Extensions for ObjC (RAC). Powerful but dense; Swift's Combine is the spiritual successor. | build |
| [FLEX](https://github.com/FLEXTool/FLEX) | In-app debugging toolbar — inspect views, edit defaults, network history, runtime introspection. Indispensable. | debug |
| [lldb-plugins / chisel](https://github.com/facebook/chisel) | Facebook's collection of LLDB Python helpers — pviews, pvc, border, taplog. Big productivity boost. | debug |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 1.0 | 1984 | Brad Cox & Tom Love release Objective-C at Productivity Products International — Smalltalk-style messaging on C. |
| NeXTSTEP | 1989 | NeXT adopts ObjC as the language of NeXTSTEP (the AppKit/Foundation roots of Cocoa). Steve Jobs brings it to Apple in 1996. |
| 2.0 | 2006 | Modern Objective-C: @property synthesis, fast enumeration, for-in, garbage collection (later removed), 64-bit clean. |
| Blocks | 2009 | Closures (blocks) added with iOS 4 / Mac OS X 10.6 — required for GCD and modern completion-handler APIs. |
| ARC | 2011 | Automatic Reference Counting (Xcode 4.2 / iOS 5) — compiler inserts retain/release, eliminating a whole class of memory bugs. |
| Literals | 2012 | Clang adds @1, @"str", @[], @{} literals and subscripting (arr[0], dict[k]) — major readability win. |
| Steady state | 2026 | Language frozen (last major features 2015: nullability, generics). Still required for macOS/iOS internals; SwiftUI covers new app UI work. |
| Modules | 2013 | @import Module; — precompiled headers replaced by semantic modules; faster builds, no more #import cycles. |
| Nullability | 2014 | nullable / nonnull / null_resettable annotations bridge to Swift optionals. Apple audits the entire SDK in 2015. |
| Lightweight Generics | 2015 | NSArray<NSString*> — typed collections, mostly compile-time enforced; interop with Swift's [String]. |
| Swift era | 2014 | Swift 1.0 ships; ObjC remains the implementation language for Cocoa but new code migrates. Bridging via @objc and headers. |
| ObjC 2.2 / Stable ABI | 2019 | Runtime API frozen; Swift 5 ABI stability makes ObjC the long-term ABI floor for Apple platforms. |
| Swift-first | 2024 | Apple's SDKs are Swift-first; ObjC reserved for headers, runtime surgery, C++ interop, and legacy maintenance. |

## Interview Hot Questions

1. **What actually happens when you write [obj doThing:1]?** *(medium)*

   The compiler emits a call to objc_msgSend(obj, sel_doThing_, 1). objc_msgSend looks up the selector in obj's class's method cache (fast path, a few ns), falls back to the class's method table and superclass chain on miss. Once found, it jumps to the IMP (function pointer). If no method is found, the runtime invokes forwardingTargetForSelector: / forwardInvocation:, allowing dynamic dispatch. nil receivers return zeroed values (the runtime checks for nil before dereferencing).

2. **Explain ARC vs garbage collection — what did ObjC try and why did ARC win?** *(medium)*

   Apple shipped garbage collection for Mac OS X 10.5 (2007) and deprecated it in 10.8 (2012). GC added stop-the-world pauses incompatible with UI responsiveness and doubled memory in some cases. ARC (2011) is compile-time reference counting — the compiler inserts retain/release/autorelease calls statically. Same runtime cost as manual MRC, no pauses, deterministic dealloc. ARC doesn't handle retain cycles; you still need __weak for that.

3. **Why does messaging nil not crash? When is this dangerous?** *(easy)*

   objc_msgSend checks for nil receiver and returns zero/nil/NO/0.0 immediately without dispatching. This makes nil-safe chains natural. The danger: it hides bugs (you expect a side effect that never happens), and struct returns are implementation-defined for nil receivers on some ABIs. Also, nil is NOT the same as [NSNull null] — collections don't accept nil, you use NSNull as a placeholder.

4. **What's a retain cycle and how do you break it?** *(easy)*

   Two (or more) objects holding strong references to each other — A's property points to B, B's property points to A. Neither's refcount hits zero, so neither deallocs. Classic case: a block stored as a property of self captures self strongly. Fix: capture __weak typeof(self) weakSelf = self outside the block, then __strong typeof(weakSelf) strong = weakSelf inside to get a temporary strong ref for the block body. NSPointerArray, NSMapTable with weak options for collection-based cycles.

5. **How does KVO work under the hood?** *(hard)*

   When you call addObserver:forKeyPath:, the runtime dynamically creates a subclass of your class ( NSKVONotifying_YourClass) and swaps the isa pointer of the observed instance. The subclass overrides the setter for the key path to call -willChangeValueForKey: / -didChangeValueForKey: around the original setter, which triggers observer notifications. This is why [obj class] returns the original class but object_getClass(obj) returns the KVO subclass. Removing the observer restores the original isa. Forgetting to remove observers before dealloc crashes.

6. **When would you use @try/@catch vs NSError?** *(medium)*

   NSError** for recoverable errors (file not found, network failure, invalid user input) — caller decides what to do, no stack unwinding. @try/@catch for genuinely exceptional programmer errors (broken invariant, bad state) — slow (DWARF unwinding), frameworks may leak resources on throw, and Cocoa code is generally NOT exception-safe past the throw point. Reserve exceptions for things you'd crash on in release.

7. **Explain class clusters with NSArray as an example.** *(medium)*

   NSArray is an abstract base. [[NSArray alloc] init] actually returns __NSArrayI (immutable, constant storage); [[NSMutableArray alloc] init] returns __NSArrayM. The concrete subclass is chosen by the cluster at alloc/init time based on the data. This lets Apple optimize storage (e.g., tagged pointers for small NSNumber/NSString). Consequence: never hardcode subclass names; subclass NSArray itself only if you accept implementing the primitive methods (count, objectAtIndex:).

8. **What does the copy attribute on @property do, and when is it wrong?** *(medium)*

   copy makes the setter invoke [value copy] before storing — defensive against mutable subclasses (NSString property assigned an NSMutableString would otherwise mutate under you). Use copy for NSString, NSAttributedString, NSArray, NSDictionary, NSSet. Use strong when you explicitly want shared mutability. For NSManagedObject attributes the rules differ — CoreData has its own accessors. copy is incompatible with mutable subclasses (NSMutableArray property with copy silently breaks mutations).

9. **How do you swizzle a method, and when should you not?** *(hard)*

   Get the Method for two selectors via class_getInstanceMethod, then method_exchangeImplementations swaps their IMPs. After that, calling selector A runs the IMP of selector B and vice versa. Use for cross-cutting concerns in your own code (logging, metrics). DON'T swizzle framework methods you don't own — breaks across OS versions, surprises other code, makes debugging hellish. Prefer subclassing, categories with prefixed names, or method_setImplementation (more targeted than full exchange).

## When to Choose This

- **vs Swift:** use this — Maintaining legacy Cocoa codebases, C/C++ interop, runtime surgery (swizzling, KVO internals), header-based public API that Swift can't express.; use that — Greenfield Apple apps, anything memory-safe, code needing value types, generics, or pattern matching. Swift is the default since 2014.
- **vs C++:** use this — Apple-platform UI work (Cocoa/AppKit/UIKit), dynamic dispatch with nil-safe messaging, header-only public API on Apple platforms.; use that — Cross-platform native code, game engines, performance-critical templated libraries (Eigen, Boost), zero-overhead abstractions.
- **vs Java:** use this — Native Mac/iOS apps, tight Cocoa integration, no JVM dependency, smaller runtime footprint.; use that — Cross-platform backend services, enterprise server-side, Android (via Kotlin/Java), anywhere the JVM ecosystem matters.
- **vs Ruby:** use this — Compiled native Apple binaries, hard-realtime, mobile/embedded Apple work.; use that — Web backends (Rails), DSLs, scripting, metaprogramming-heavy domains. Ruby's dynamism is at the language level; ObjC's is at the runtime level.

