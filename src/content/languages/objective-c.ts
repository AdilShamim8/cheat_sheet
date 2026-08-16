import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "objective-c",
  name: "Objective-C",
  category: "languages",
  tier: 3,
  tags: ["dynamic", "compiled", "c-superset", "smalltalk-inspired", "apple", "message-passing", "cocoa"],
  tagline: "Smalltalk-style message passing layered over C — Apple's lingua franca for Cocoa until Swift arrived.",
  year: 1984,
  author: "Brad Cox & Tom Love",

  tldr: [
    "Objective-C is a thin object layer bolted onto C: every method call is a runtime message send (`objc_msgSend`) dispatched through a class's method table, and the object model is borrowed wholesale from Smalltalk.",
    "It dominated macOS, iOS, iPadOS, and the entire Cocoa/Cocoa Touch stack from the NeXTSTEP era (1989) until Swift replaced it as the default in 2014; the frameworks you call (UIKit, Foundation) are still implemented in ObjC and bridged to Swift.",
    "Reach for Objective-C when maintaining legacy Cocoa codebases, writing C-compatible public APIs that Swift can't express, debugging framework internals, or interfacing with the Objective-C runtime directly (KVO, swizzling, dynamic subclasses).",
    "Avoid it for greenfield Apple apps — Swift is faster to write, memory-safe, and the default since Xcode 6. New ObjC should be reserved for header files, C++ interop, and runtime surgery.",
  ],

  mentalModel: {
    title: "Messages to objects, not calls to functions",
    body: "An ObjC method invocation `[obj doThing:1 with:2]` compiles to `objc_msgSend(obj, sel_doThing_with_, 1, 2)` — a C function that looks up the selector in obj's class (and its superclasses), then jumps. The receiver can be nil (the message is silently swallowed), the selector can be unknown (you get forwarding via `forwardingTargetForSelector:` / `forwardInvocation:`), and you can rewire the dispatch table at runtime (swizzling, ISA-swapping). The C underneath still owns memory, pointers, and structs — ARC handles retain/release for ObjC objects but does nothing for malloc'd buffers or CoreFoundation toll-free bridging.",
  },

  constructs: [
    { syntax: "@interface Foo : NSObject <NSCopying>\n@end", behavior: "Declares a class with superclass and adopted protocols; methods go in @implementation.", when: "Public header contract — what other files see." },
    { syntax: "- (void)drawIn:(NSRect)r;\n+ (instancetype)shared;", behavior: "`-` instance method, `+` class method;instancetype returns the receiver's type for subclasses.", when: "Every method declaration — there are no free functions in the object model." },
    { syntax: "[obj doThing:x with:y]", behavior: "Message send — compiles to objc_msgSend; nil receiver returns zero/nil silently.", when: "All method calls; this is the syntax, not a wrapper." },
    { syntax: "@property (nonatomic, copy) NSString *name;", behavior: "Generates getter/setter + ivar; `copy` for NSStrings, `strong`/`weak` for object graphs.", when: "Declared state — almost always prefer over raw ivars." },
    { syntax: "obj.name  // == [obj name]", behavior: "Dot syntax calls the getter/setter — not field access.", when: "Property access; reads identically to message send." },
    { syntax: "@autoreleasepool { ... }", behavior: "Delimits an autorelease pool drain scope — needed in tight loops creating many temporaries.", when: "Non-ARC code, or ARC code that allocates millions of objects in a loop." },
    { syntax: "id<NSFastEnumeration> seq", behavior: "Typeless object that adopts a protocol — dynamic typing + protocol contract.", when: "Collections, delegates, anything polymorphic." },
    { syntax: "__weak typeof(self) weakSelf = self;", behavior: "Breaks retain cycles in blocks capturing self.", when: "Every block that outlives the current scope and references self." },
    { syntax: "@try { ... } @catch (NSException *e) { ... }", behavior: "Exception handling — only for truly exceptional programmer errors, NOT normal control flow.", when: "Catching programming bugs; Cocoa reserves exceptions for unrecoverable contract violations." },
    { syntax: "dispatch_async(queue, ^{ ... });", behavior: "GCD — submit a block to a queue; the canonical ObjC concurrency primitive.", when: "Background work, main-thread hops, serialization queues." },
    { syntax: "[NSObject respondsToSelector:@selector(foo:)]", behavior: "Duck-typing probe via the runtime — true if the class implements the selector.", when: "Optional protocol methods, informal protocols, defensive interop." },
    { syntax: "CFBridgingRelease / __bridge_transfer", behavior: "Toll-free bridge between CoreFoundation (C) and Foundation (ObjC) under ARC.", when: "Interfacing with CF types like CFString / CFArray." },
  ],

  patterns: [
    {
      lang: "objective-c",
      caption: "Modern class with ARC, designated initializer, and NSCopying",
      code: `// Foo.h
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
@end`,
    },
    {
      lang: "objective-c",
      caption: "GCD + weakSelf pattern — the canonical async block",
      code: `- (void)fetchThenRender {
    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSData *data = [self fetchSync];   // strong ref captured here
        __strong typeof(weakSelf) strong = weakSelf;
        if (!strong) return;               // dealloced while we were working
        dispatch_async(dispatch_get_main_queue(), ^{
            [strong render:data];
        });
    });
}`,
    },
    {
      lang: "objective-c",
      caption: "Block as completion handler — error-by-convention",
      code: `typedef void (^FetchCompletion)(NSData *data, NSError *error);

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
}`,
    },
    {
      lang: "objective-c",
      caption: "Fast enumeration + NSArray literals",
      code: `NSArray *users = @[@"alice", @"bob", @"carol"];
NSDictionary *ages = @{@"alice": @30, @"bob": @41};

NSMutableString *log = [NSMutableString string];
for (NSString *name in users) {           // NSFastEnumeration — O(n), no index math
    NSNumber *age = ages[name];           // nil-safe: missing key -> nil, not crash
    [log appendFormat:@"%@@%@\\n", name, age];
}
NSLog(@"%@", log);`,
    },
  ],

  pitfalls: [
    {
      title: "Messaging nil silently does nothing",
      symptom: "`[nil doThing]` returns 0/nil/NO/0.0 depending on return type instead of crashing — bugs hide as missing side effects and zeroed return values for pages.",
      fix: "Assert on inputs you actually need: `NSParameterAssert(obj)`. Treat nil-eating as a Cocoa convention for collections and delegates, not a license to skip preconditions.",
    },
    {
      title: "Retain cycles via blocks capturing self",
      symptom: "A block held by `self` (or a property of self) captures self strongly — dealloc never fires, memory leaks.",
      fix: "Capture `__weak typeof(self) weakSelf = self` outside, then `__strong typeof(weakSelf) strong = weakSelf` inside to get a temporary strong ref for the block body.",
    },
    {
      title: "Using `copy` wrong on NSString properties",
      symptom: "`@property NSString *name;` with no copy attribute — if a caller passes an NSMutableString and later mutates it, your stored name changes underneath you.",
      fix: "Always `copy` for NSString, NSAttributedString, NSArray, NSDictionary. Use `strong` only when you explicitly want shared mutability.",
    },
    {
      title: "Exception handling is not for control flow",
      symptom: "Throwing NSException inside Cocoa frameworks may leave the framework in an inconsistent state — unlike Java, ObjC code is not exception-safe past the throw point.",
      fix: "Use NSError** out-parameters for recoverable errors. Reserve @try/@catch for programmer errors you intend to crash on in release builds.",
    },
    {
      title: "ISA swizzling and KVO observation order",
      symptom: "KVO dynamically subclasses your class and overrides setters — calling `[super dealloc]` or `class_getInstanceSize` may surprise you, and removing the wrong observer crashes.",
      fix: "Always pair `addObserver:forKeyPath:` with `removeObserver:forKeyPath:` in dealloc; prefer block-based KVO (`-observeValueForKeyPath:ofObject:change:context:` or the iOS 11 `NSObject` block API).",
    },
    {
      title: "Bridging CoreFoundation under ARC",
      symptom: "`CFStringRef s = (__bridge CFStringRef)nsString;` works, but `CFRelease(s)` afterwards double-frees; forgetting `__bridge_transfer` leaks.",
      fix: "`__bridge` for a no-op cast, `__bridge_retained` to give ARC's ownership to CF (then you must CFRelease), `__bridge_transfer` to give CF ownership back to ARC.",
    },
    {
      title: "Category method name collisions",
      symptom: "Two categories on NSObject define `-myHelper` — which one wins is undefined and changes between builds, producing impossible-to-debug crashes.",
      fix: "Prefix category methods (`myco_myHelper`), never override existing methods in a category (subclass instead), and add `+load` only for setup that must run before main().",
    },
  ],

  quickReference: [
    { fact: "All message sends compile to objc_msgSend (or a variant like objc_msgSend_stret for large struct returns) — there is no static dispatch in the object model.", tag: "perf" },
    { fact: "isa pointer (8 bytes) + refcount + ivars per instance — minimum object size is 16 bytes on arm64.", tag: "complexity" },
    { fact: "ARC was introduced with Xcode 4.2 / iOS 5 (2011); pre-ARC code uses retain/release/autorelease manually.", tag: "version" },
    { fact: "Swift's `AnyObject` and `id` are bridged; pure Swift classes inherit from NSObject only when marked `@objc` or descending from NSObject.", tag: "version" },
    { fact: "Method lookup is cached in a class's method cache after first send — subsequent calls are ~3-5ns; cold sends are ~50-100ns due to table walk.", tag: "perf" },
    { fact: "nil messaging returning a struct is implementation-defined on arm64 — only scalar/pointer returns are guaranteed nil-safe.", tag: "gotcha" },
    { fact: "Property `atomic` (default) adds a lock per access; `nonatomic` skips it. Cocoa code uses `nonatomic` almost everywhere because atomicity ≠ thread safety.", tag: "gotcha" },
    { fact: "Blocks are stack-allocated by default — `^{...}` escapes the scope unless you copy them (`[block copy]` or assign to a `copy` property). ARC copies blocks on capture for you.", tag: "gotcha" },
    { fact: "@selector(foo:) is resolved at load time; runtime swizzling changes the IMP behind it.", tag: "complexity" },
    { fact: "Foundation's collection classes are class clusters — `[[NSArray alloc] init]` returns __NSArrayI, not NSArray. Never hardcode subclass names.", tag: "gotcha" },
    { fact: "Toll-free bridging: CFString ↔ NSString, CFArray ↔ NSArray, CFDictionary ↔ NSDictionary share the same ISA in Foundation.", tag: "perf" },
    { fact: "Swift ABI has been stable since Swift 5 (2019); ObjC interop is now the long-term ABI floor for Apple platforms.", tag: "version" },
    { fact: "Coding style: prefix class names with 2-3 capital letters (NS, UI, CF) — Apple reserves the underscore prefix.", tag: "style" },
    { fact: "Header (.h) is the public contract; implementation (.m) holds the code. Use class extensions (anonymous @interface in .m) for private state.", tag: "style" },
    { fact: "Modern code uses nullability annotations (`nullable`, `nonnull`, `null_resettable`) — these bridge to Swift optionals.", tag: "version" },
  ],

  goDeeper: [
    { title: "The Objective-C Programming Language (Apple)", url: "https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/", note: "Apple's canonical conceptual guide — read the Messaging and Encapsulating Data chapters." },
    { title: "Objective-C Runtime Programming Guide", url: "https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/", note: "The runtime reference — objc_msgSend, swizzling, dynamic subclassing, KVO internals." },
    { title: "objc-runtime source (Apple open source)", url: "https://opensource.apple.com/source/objc4/", note: "The actual implementation of objc_msgSend, class registration, and ARC entry points." },
    { title: "Effective Objective-C 2.0 (Matt Galloway)", url: "https://www.oreilly.com/library/view/effective-objective-c/9780133391779/", note: "52 specific items — the closest analog to Effective C++ for the Cocoa world." },
    { title: "Cocoa Design Patterns (Erik Buck)", url: "https://www.oreilly.com/library/view/cocoa-design-patterns/9780321573040/", note: "Explains why the frameworks look the way they do: class clusters, delegates, responders, invocations." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "id", behavior: "Pointer to any ObjC object — no static type info, all dispatch is runtime.", when: "Collections of mixed types, delegates, dynamic APIs. Bridged to Swift's 'AnyObject' / 'Any'." },
      { syntax: "instancetype", behavior: "Type of the receiving class for subclass-friendly init/factory methods.", when: "All init, alloc, factory returns. Compiler-checked covariant return; preferred over 'id' for constructors." },
      { syntax: "Class", behavior: "Object representing a class itself; obtained via [Foo class] or NSStringFromClass.", when: "Reflection, factory patterns, KVO internals. isa pointer points here." },
      { syntax: "SEL", behavior: "Opaque type representing a selector (method name) — interned string, O(1) compare.", when: "@selector(foo:), target/action, dynamism. Resolved to IMP by the runtime." },
      { syntax: "IMP", behavior: "Function pointer to a method's implementation — the C function objc_msgSend dispatches to.", when: "Method swizzling, fast-path caching, bypassing the dispatch table." },
      { syntax: "BOOL", behavior: "typedef signed char (NOT stdbool _Bool) — YES=1, NO=0. Watch: any non-zero char != YES.", when: "Predicates, success flags. Compare with == YES only if you are sure the value is 0 or 1." },
      { syntax: "NSInteger / NSUInteger", behavior: "Architecture-sized int (32 or 64 bit) — bridged to Swift's Int/UInt.", when: "All integer math; never use raw 'int' in modern ObjC, it breaks 64-bit clean." },
      { syntax: "CGFloat", behavior: "typedef double on 64-bit, float on 32-bit — Core Graphics' float type.", when: "All drawing/geometry; matching the framework's type avoids implicit conversions." },
      { syntax: "NSRange", behavior: "C struct {location, length} — NOT a class. Use NSMakeRange or NSMakeRange-encoded literals.", when: "String/range slicing, regex matches, text selection. Pass by value." },
    ],
    collections: [
      { syntax: "NSArray / NSMutableArray", behavior: "Ordered, immutable/mutable collection of objects; nil-terminated literal @[@1, @2].", when: "Ordered lists of objects. Class cluster — never subclass; use NSMutableArray for mutability." },
      { syntax: "NSDictionary / NSMutableDictionary", behavior: "Keyed map — keys must be NSCopying; literal @{k: v}.", when: "JSON-like data, caches. Insertion-ordered? No — use NSOrderedSet or rely on allKeys enumeration." },
      { syntax: "NSSet / NSMutableSet", behavior: "Unordered, unique objects — O(1) membership via hash.", when: "Dedup, membership tests, set algebra (union/intersect/minus)." },
      { syntax: "NSOrderedSet / NSMutableOrderedSet", behavior: "Hybrid — unique elements + insertion order. Slower than NSArray but de-dupes.", when: "When you need both ordering and uniqueness (e.g., tagged items, ordered configs)." },
      { syntax: "NSIndexSet", behavior: "Sorted set of NSUIntegers — space-efficient for ranges (stores [a,b] not a..b).", when: "Table view selections, batch operations, sparse index lists." },
      { syntax: "NSData / NSMutableData", behavior: "Byte buffer — wraps raw bytes; bridged to Swift Data.", when: "Binary I/O, hashing, serialization. Use with NSInputStream/NSOutputStream for streaming." },
      { syntax: "NSValue", behavior: "Box for C structs (NSRect, NSPoint, NSRange) — objects you can put in collections.", when: "Storing CG types in arrays. NSNumber is the scalar specialization." },
      { syntax: "NSNumber", behavior: "Box for scalars — @1, @YES, @3.14 literals. Bridged to CFNumber.", when: "Putting numbers in arrays/dicts. Use NSNumber Literals (@) over [NSNumber numberWithInt:]." },
    ],
    custom: [
      { syntax: "@interface Foo : Bar <P1, P2>", behavior: "Class declaration with superclass + adopted protocols; state via @property.", when: "All public class contracts. Header (.h) file." },
      { syntax: "@protocol P <P_base>", behavior: "Protocol — interface any class can adopt; @required (default) and @optional methods.", when: "Delegates, data sources, plugin contracts. Optional methods require respondsToSelector: checks." },
      { syntax: "@interface Foo (Category)", behavior: "Category — add methods to any class (even ones you don't own); no ivars, no new state.", when: "Utility methods, framework extension. Prefix names to avoid collisions (myco_helper)." },
      { syntax: "@interface Foo () { ... }", behavior: "Class extension (anonymous category in .m) — private state + method decls visible only inside.", when: "Private ivars, internal-only properties, hiding public readonly behind readwrite private." },
      { syntax: "typedef NS_ENUM(NSInteger, Style)", behavior: "Typed enum (NS_ENUM for scalar, NS_OPTIONS for bitmask).", when: "Closed value sets; bridges to Swift enum cleanly (vs raw enum which bridges as Int)." },
      { syntax: "typedef ReturnType (^Name)(ArgTypes)", behavior: "Block type alias — blocks are closure objects on the heap (under ARC).", when: "Callbacks, completion handlers, GCD. Use copy property for stored blocks." },
      { syntax: "@interface Foo : NSObject <NSCopying>", behavior: "Value class implementing copyWithZone: — required for use as NSDictionary keys.", when: "Immutable value types; pair with @property (copy) for safety." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "[obj msg:arg]", behavior: "Message send — compiles to objc_msgSend(obj, sel, arg). Nil-safe for scalar returns.", when: "All method calls; this IS the syntax, not a wrapper." },
    { syntax: "obj.prop  // [obj prop]", behavior: "Dot syntax — calls the accessor, not field access. Setter: obj.prop = x.", when: "Property read/write; identical bytecode to bracket form." },
    { syntax: "@1, @\"hi\", @[]", behavior: "Boxed expressions — NSNumber/NSString/NSArray literals (Clang extension, Xcode 4.4+).", when: "Modern literal syntax; replaces [NSNumber numberWithInt:1] etc." },
    { syntax: "a == b", behavior: "Pointer equality — compares object identity, NOT values.", when: "Identity checks. For value equality use [a isEqual:b] or isEqualToString:." },
    { syntax: "[a isEqual:b]", behavior: "Value equality — NSObject default is identity; NSString/NSNumber/NSArray override.", when: "All value comparisons. Override isEqual: together with hash." },
    { syntax: "a ?: b", behavior: "Nil-coalesce — returns a if non-nil, else b (GCC extension).", when: "Default values: obj.name ?: @\"unknown\". Cleaner than ternary with nil check." },
    { syntax: "obj && obj.x", behavior: "Short-circuit logical AND — left-to-right; second operand only evaluated if first is truthy.", when: "Guard chains. nil is falsy, all other objects truthy." },
    { syntax: "a, b, c  (comma)", behavior: "Sequence — evaluates all, returns last. Rare in idiomatic ObjC.", when: "for-loop init/update; otherwise avoid." },
    { syntax: "&obj, *ptr", behavior: "Address-of / dereference — same as C. ObjC objects are always pointers already.", when: "C interop, NSError** out-params, struct pointers." },
    { syntax: "obj->ivar", behavior: "Direct ivar access — bypasses accessors; only works on your own class's ivars (or @public).", when: "Inside init/dealloc to avoid triggering accessor side effects; otherwise discouraged." },
    { syntax: "a ? b : c", behavior: "Ternary — returns nil-safe: nil as condition is false.", when: "Concise conditionals; nesting hurts readability." },
    { syntax: "@YES, @NO", behavior: "Boxed BOOL — produces NSNumber (not a true boolean object).", when: "Putting bools in collections; [flag boolValue] to unwrap." },
    { syntax: "a ^ b, a | b, a & b", behavior: "Bitwise — operate on integer types only (NSInteger, NSUInteger, etc.).", when: "Flag masks, NS_OPTIONS enums." },
    { syntax: "a << n, a >> n", behavior: "Bit shift — unsigned logical; signed arithmetic shift.", when: "Bit-flag construction, hash mixing." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "objective-c",
      caption: "Streaming file read via NSInputStream (memory-bounded)",
      code: `// Read a multi-GB file in 8KB chunks — never loads the whole file.
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
[stream close];   // NSStreamDelegate for async variants`,
    },
    {
      lang: "objective-c",
      caption: "JSON serialization with NSJSONSerialization",
      code: `// Encode: dict/array -> NSData
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
NSString *user = parsed[@"user"];   // nil-safe subscripting`,
    },
    {
      lang: "objective-c",
      caption: "NSURLSession with delegate-based auth + retries",
      code: `NSURLSessionConfiguration *cfg = [NSURLSessionConfiguration defaultSessionConfiguration];
cfg.timeoutIntervalForRequest = 30;
cfg.HTTPAdditionalHeaders = @{@"User-Agent": @"MyApp/1.0"};

NSURLSession *session = [NSURLSession sessionWithConfiguration:cfg
                                                     delegate:self
                                                delegateQueue:nil];

NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
req.HTTPMethod = @"POST";
req.HTTPBody = [@"{\"k\":1}" dataUsingEncoding:NSUTF8StringEncoding];
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
[task resume];   // tasks start suspended; resume fires them`,
    },
    {
      lang: "objective-c",
      caption: "Property list (plist) round-trip — typed config serialization",
      code: `// Only NSArray, NSDictionary, NSString, NSData, NSDate, NSNumber are plist-valid.
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
}`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "objective-c",
      caption: "Fast enumeration — the default for-in",
      code: `// NSFastEnumeration protocol: NSArray, NSDictionary, NSSet, NSRange.
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
// Build a list of keys to delete, then remove them after the loop.`,
    },
    {
      lang: "objective-c",
      caption: "Enumerate with options — reverse, concurrent",
      code: `// NSEnumerationReverse — iterate back-to-front (e.g., safe mutation while removing).
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

// enumerateObjectsUsingBlock: (no options) — sequential, block gets (obj, idx, &stop).`,
    },
    {
      lang: "objective-c",
      caption: "dispatch_apply — parallel counted loop with barrier",
      code: `// GCD parallel for-loop. Iterations run concurrently on a global queue;
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
// 'results' is fully populated here — dispatch_apply is synchronous.`,
    },
    {
      lang: "objective-c",
      caption: "NSEnumerator — explicit, composable",
      code: `// Older but still useful when you need the enumerator object itself.
NSEnumerator *e = [items objectEnumerator];
id obj;
while ((obj = [e nextObject])) {
    if (shouldSkip(obj)) continue;
    process(obj);
}

// reverseObjectEnumerator is a common alternative for safe-mutation loops.
// Compose with filteredEnumerator via NSPredicate for filtered iteration:
NSPredicate *p = [NSPredicate predicateWithFormat:@"age >= 30"];
NSArray *older = [users filteredArrayUsingPredicate:p];`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "objective-c",
      caption: "Blocks — closures with ARC-managed capture",
      code: `// A block captures its enclosing scope. Under ARC, blocks are copied to
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
r(10);  // 115   -- captured state persists across calls`,
    },
    {
      lang: "objective-c",
      caption: "Designated initializer chain + convenience inits",
      code: `@interface Vector : NSObject
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
// Subclasses override the designated init; convenience inits keep working.`,
    },
    {
      lang: "objective-c",
      caption: "Variadic methods with va_list",
      code: `// Variadic — like C, no type info on the variable part. Use a sentinel.
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
// For typed variadic (same type, count given), prefer NSArray literal @[@1,@2,@3].`,
    },
    {
      lang: "objective-c",
      caption: "Selectors + IMP — dynamic dispatch tricks",
      code: `// Perform a selector dynamically — used by target/action, KVO, undo.
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
// Use sparingly — global, hard to debug, breaks expectations.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "objective-c",
      caption: "NSError** out-parameter — the Cocoa convention",
      code: `// Cocoa separates PROGRAMMER errors (exceptions) from RECOVERABLE errors (NSError).
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
}`,
    },
    {
      lang: "objective-c",
      caption: "@try / @catch / @finally — exception handling",
      code: `// Exceptions in ObjC are for PROGRAMMER errors (broken invariants).
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

// Don't use @try for normal control flow. NSError is the path for recoverable errors.`,
    },
    {
      lang: "objective-c",
      caption: "Custom NSError domain + recovery attempter",
      code: `NSString *const MyErrorDomain = @"com.myapp";

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
// the user recovery buttons in the standard error panel.`,
    },
    {
      lang: "objective-c",
      caption: "Guarded resource lifecycle with cleanup block",
      code: `// No language-level 'defer', but a small helper class emulates it.
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
// malloc'd buffers, CFRelease, file descriptors — use @finally.`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "objective-c",
      caption: "GCD — the canonical queues + dispatch_async",
      code: `// Three queue types: main (serial), global (concurrent, QoS-classed), private.
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
dispatch_queue_t workQ = dispatch_queue_create("com.myapp.work", DISPATCH_QUEUE_SERIAL);`,
    },
    {
      lang: "objective-c",
      caption: "Dispatch semaphore — bounded concurrency",
      code: `// Limit concurrent network calls to avoid saturating the server.
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
}`,
    },
    {
      lang: "objective-c",
      caption: "Dispatch group — wait for a batch to finish",
      code: `dispatch_group_t group = dispatch_group_create();
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
});`,
    },
    {
      lang: "objective-c",
      caption: "NSOperationQueue — cancellable, dependent, prioritized",
      code: `// Higher-level than raw GCD: cancellable, dependencies, max concurrency.
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
//   if (op.cancelled) return;`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "objective-c",
      caption: "XCTest — basic assertions and structure",
      code: `#import <XCTest/XCTest.h>
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
@end`,
    },
    {
      lang: "objective-c",
      caption: "Async test with expectations",
      code: `- (void)testFetchCompletes {
    XCTestExpectation *exp = [self expectationWithDescription:@"fetch returns"];

    [self fetch:^(NSData *data, NSError *err) {
        XCTAssertNil(err);
        XCTAssertGreaterThan(data.length, 0);
        [exp fulfill];   // mark the expectation as met
    }];

    // Wait up to 5 seconds; fails the test if exp isn't fulfilled.
    [self waitForExpectations:@[exp] timeout:5.0];
}

// For multiple async ops: create N expectations, fulfill each, wait once.`,
    },
    {
      lang: "objective-c",
      caption: "Mocking with OCMock — stubbing and verifying",
      code: `// OCMock is the standard ObjC mocking library (third-party, CocoaPods).
id mock = OCMClassMock([NSURLSession class]);

// Stub a method to return canned data:
OCMStub([mock dataTaskWithRequest:OCMOCK_ANY completionHandler:OCMOCK_ANY])
    .andReturn(dummyTask);

// Verify a method was called with specific args:
OCMVerify([mock dataTaskWithRequest:[OCMArg checkWithBlock:^BOOL(id req) {
    return [req.URL.absoluteString isEqualToString:@"https://x"];
}] completionHandler:OCMOCK_ANY]);

// Argument constraints: OCMArg.any, OCMArg.isNil, OCMArg checkWithBlock:,
// OCMArg setValue:forKey: (mutate the arg in place).`,
    },
    {
      lang: "objective-c",
      caption: "Performance test — measure block execution",
      code: `- (void)testSortPerformance {
    [self measureBlock:^{
        // XCTest runs this 5+ times, measures median + stddev, compares
        // against the baseline stored from a previous run.
        NSArray *sorted = [self.unsorted sortedArrayUsingSelector:@selector(compare:)];
        // The baseline is set in Xcode's Test Navigator; failures flag regressions.
        [sorted firstObject];   // prevent dead-code elimination
    }];
}

// measureMetrics:automaticallyStartMeasuring: for finer control over
// what's measured (clockTime, cpuTime, userTime, peakHeap, allocCount).`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "objc_msgSend is a few nanoseconds after the method cache warms (3-5ns typical on arm64); cold sends walking the class hierarchy are 50-100ns.", tag: "perf" },
    { fact: "Method cache is per-class, keyed by SEL; first send to a given selector on a class is slow, subsequent sends hit the cache (~98% hit rate in real apps).", tag: "perf" },
    { fact: "Tagged pointers: small NSNumbers/NSStrings/NSDate stored INSIDE the pointer, no allocation. @1, @\"a\" literals often don't allocate at all.", tag: "perf" },
    { fact: "ARC retain/release on strong properties compiles to objc_storeStrong / objc_retain calls — a few ns each; avoid in inner loops operating on millions of objects.", tag: "perf" },
    { fact: "Autorelease pools: temporary objects in a tight loop fill the pool until drain. Wrap in @autoreleasepool { ... } to bound peak memory.", tag: "perf" },
    { fact: "NSDictionary lookups are O(1) amortized but ~3-4x slower than a C++ std::unordered_map due toboxing and message sends on every key compare.", tag: "perf" },
    { fact: "NSArray subscripting (arr[0]) compiles to objectAtIndexedSubscript: — same as the explicit form; no perf difference, only syntax.", tag: "perf" },
    { fact: "NSString copy on @property is a copy for immutables (NSConstantString shares), a real copy for NSMutableString. Always declare copy for NSString to prevent mutable-subclass mutation.", tag: "gotcha" },
    { fact: "Class clusters (NSArray, NSString, NSDictionary) pick the most efficient concrete subclass at alloc time — __NSArrayI for immutable, __NSArrayM for mutable. Don't depend on concrete types.", tag: "gotcha" },
    { fact: "Fast enumeration sends one batch message per ~16 objects, not one per object — measure with Instruments' Time Profiler.", tag: "perf" },
    { fact: "Instruments: Time Profiler (CPU), Allocations (heap), Leaks (CFMalloc'd leaks), System Trace (scheduling/synchronization). All sample-based except Leaks.", tag: "perf" },
    { fact: "GCD dispatch_async has ~2us overhead; for sub-microsecond work batch inside one block. Serial queue dispatch_sync is ~0.5us.", tag: "perf" },
    { fact: "BOOL is signed char — comparing to YES fails for any non-1 truthy value. Always use if (flag) not if (flag == YES).", tag: "gotcha" },
    { fact: "isa pointer is 8 bytes on arm64 (non-pointer isa packs refcount/class bits); minimum object size is 16 bytes.", tag: "complexity" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "Xcode", purpose: "Apple's IDE — project files, Interface Builder, simulators, Instruments. Required for shipping iOS/macOS apps.", url: "https://developer.apple.com/xcode/", category: "build" },
    { tool: "CocoaPods", purpose: "Centralized dependency manager (Podfile) — Ruby-based, mature, large registry. Most common in legacy codebases.", url: "https://cocoapods.org/", category: "package" },
    { tool: "Carthage", purpose: "Decentralized dependency manager — builds XCFrameworks, no project modification. Less magic than CocoaPods.", url: "https://github.com/Carthage/Carthage", category: "package" },
    { tool: "Swift Package Manager (SPM)", purpose: "Apple's official package manager; ObjC packages supported since Xcode 11. The future default.", url: "https://www.swift.org/package-manager/", category: "package" },
    { tool: "Instruments", purpose: "Profiling suite bundled with Xcode — Time Profiler, Allocations, Leaks, System Trace, Core Animation.", url: "https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/", category: "debug" },
    { tool: "LLDB", purpose: "Default debugger in Xcode — po (print object), expr, watchpoint, condition breakpoints. Replaces GDB on Apple platforms.", url: "https://lldb.llvm.org/", category: "debug" },
    { tool: "XCTest", purpose: "Apple's unit/UI testing framework — assertions, expectations, performance metrics, UI tests via XCUITest.", url: "https://developer.apple.com/documentation/xctest", category: "test" },
    { tool: "OCMock", purpose: "The standard mocking library for ObjC — stubs, class mocks, partial mocks, verification.", url: "http://ocmock.org/", category: "test" },
    { tool: "Kiwi / Specta", purpose: "BDD-style testing frameworks (RSpec-like). Largely superseded by Quick/Nimble in Swift-first codebases.", url: "https://github.com/kiwi-bdd/Kiwi", category: "test" },
    { tool: "Clang Static Analyzer", purpose: "Built into Xcode (Analyze action) — finds retain cycles, null derefs, dead stores. scan-build for CI.", url: "https://clang-analyzer.llvm.org/", category: "lint" },
    { tool: "Clang-Format", purpose: "Code formatter — LLVM / Google / WebKit / Mozilla / LLVM styles; configure via .clang-format.", url: "https://clang.llvm.org/docs/ClangFormat.html", category: "lint" },
    { tool: "Mantle / KZPropertyMapper", purpose: "Legacy model-serialization frameworks (Mantle from GitHub). Pre-dates Swift's Codable; still in old codebases.", url: "https://github.com/Mantle/Mantle", category: "build" },
    { tool: "AFNetworking", purpose: "The classic networking library (NSURLConnection era). Largely replaced by NSURLSession in modern code.", url: "https://github.com/AFNetworking/AFNetworking", category: "build" },
    { tool: "ReactiveObjC", purpose: "Reactive Extensions for ObjC (RAC). Powerful but dense; Swift's Combine is the spiritual successor.", url: "https://github.com/ReactiveCocoa/ReactiveObjC", category: "build" },
    { tool: "FLEX", purpose: "In-app debugging toolbar — inspect views, edit defaults, network history, runtime introspection. Indispensable.", url: "https://github.com/FLEXTool/FLEX", category: "debug" },
    { tool: "lldb-plugins / chisel", purpose: "Facebook's collection of LLDB Python helpers — pviews, pvc, border, taplog. Big productivity boost.", url: "https://github.com/facebook/chisel", category: "debug" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "1.0", year: 1984, highlight: "Brad Cox & Tom Love release Objective-C at Productivity Products International — Smalltalk-style messaging on C." },
    { version: "NeXTSTEP", year: 1989, highlight: "NeXT adopts ObjC as the language of NeXTSTEP (the AppKit/Foundation roots of Cocoa). Steve Jobs brings it to Apple in 1996." },
    { version: "2.0", year: 2006, highlight: "Modern Objective-C: @property synthesis, fast enumeration, for-in, garbage collection (later removed), 64-bit clean." },
    { version: "Blocks", year: 2009, highlight: "Closures (blocks) added with iOS 4 / Mac OS X 10.6 — required for GCD and modern completion-handler APIs." },
    { version: "ARC", year: 2011, highlight: "Automatic Reference Counting (Xcode 4.2 / iOS 5) — compiler inserts retain/release, eliminating a whole class of memory bugs." },
    { version: "Literals", year: 2012, highlight: "Clang adds @1, @\"str\", @[], @{} literals and subscripting (arr[0], dict[k]) — major readability win." },
    { version: "Modules", year: 2013, highlight: "@import Module; — precompiled headers replaced by semantic modules; faster builds, no more #import cycles." },
    { version: "Nullability", year: 2014, highlight: "nullable / nonnull / null_resettable annotations bridge to Swift optionals. Apple audits the entire SDK in 2015." },
    { version: "Lightweight Generics", year: 2015, highlight: "NSArray<NSString*> — typed collections, mostly compile-time enforced; interop with Swift's [String]." },
    { version: "Swift era", year: 2014, highlight: "Swift 1.0 ships; ObjC remains the implementation language for Cocoa but new code migrates. Bridging via @objc and headers." },
    { version: "ObjC 2.2 / Stable ABI", year: 2019, highlight: "Runtime API frozen; Swift 5 ABI stability makes ObjC the long-term ABI floor for Apple platforms." },
    { version: "Swift-first", year: 2024, highlight: "Apple's SDKs are Swift-first; ObjC reserved for headers, runtime surgery, C++ interop, and legacy maintenance." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "What actually happens when you write [obj doThing:1]?", a: "The compiler emits a call to objc_msgSend(obj, sel_doThing_, 1). objc_msgSend looks up the selector in obj's class's method cache (fast path, a few ns), falls back to the class's method table and superclass chain on miss. Once found, it jumps to the IMP (function pointer). If no method is found, the runtime invokes forwardingTargetForSelector: / forwardInvocation:, allowing dynamic dispatch. nil receivers return zeroed values (the runtime checks for nil before dereferencing).", difficulty: "medium" },
    { q: "Explain ARC vs garbage collection — what did ObjC try and why did ARC win?", a: "Apple shipped garbage collection for Mac OS X 10.5 (2007) and deprecated it in 10.8 (2012). GC added stop-the-world pauses incompatible with UI responsiveness and doubled memory in some cases. ARC (2011) is compile-time reference counting — the compiler inserts retain/release/autorelease calls statically. Same runtime cost as manual MRC, no pauses, deterministic dealloc. ARC doesn't handle retain cycles; you still need __weak for that.", difficulty: "medium" },
    { q: "Why does messaging nil not crash? When is this dangerous?", a: "objc_msgSend checks for nil receiver and returns zero/nil/NO/0.0 immediately without dispatching. This makes nil-safe chains natural. The danger: it hides bugs (you expect a side effect that never happens), and struct returns are implementation-defined for nil receivers on some ABIs. Also, nil is NOT the same as [NSNull null] — collections don't accept nil, you use NSNull as a placeholder.", difficulty: "easy" },
    { q: "What's a retain cycle and how do you break it?", a: "Two (or more) objects holding strong references to each other — A's property points to B, B's property points to A. Neither's refcount hits zero, so neither deallocs. Classic case: a block stored as a property of self captures self strongly. Fix: capture __weak typeof(self) weakSelf = self outside the block, then __strong typeof(weakSelf) strong = weakSelf inside to get a temporary strong ref for the block body. NSPointerArray, NSMapTable with weak options for collection-based cycles.", difficulty: "easy" },
    { q: "How does KVO work under the hood?", a: "When you call addObserver:forKeyPath:, the runtime dynamically creates a subclass of your class ( NSKVONotifying_YourClass) and swaps the isa pointer of the observed instance. The subclass overrides the setter for the key path to call -willChangeValueForKey: / -didChangeValueForKey: around the original setter, which triggers observer notifications. This is why [obj class] returns the original class but object_getClass(obj) returns the KVO subclass. Removing the observer restores the original isa. Forgetting to remove observers before dealloc crashes.", difficulty: "hard" },
    { q: "When would you use @try/@catch vs NSError?", a: "NSError** for recoverable errors (file not found, network failure, invalid user input) — caller decides what to do, no stack unwinding. @try/@catch for genuinely exceptional programmer errors (broken invariant, bad state) — slow (DWARF unwinding), frameworks may leak resources on throw, and Cocoa code is generally NOT exception-safe past the throw point. Reserve exceptions for things you'd crash on in release.", difficulty: "medium" },
    { q: "Explain class clusters with NSArray as an example.", a: "NSArray is an abstract base. [[NSArray alloc] init] actually returns __NSArrayI (immutable, constant storage); [[NSMutableArray alloc] init] returns __NSArrayM. The concrete subclass is chosen by the cluster at alloc/init time based on the data. This lets Apple optimize storage (e.g., tagged pointers for small NSNumber/NSString). Consequence: never hardcode subclass names; subclass NSArray itself only if you accept implementing the primitive methods (count, objectAtIndex:).", difficulty: "medium" },
    { q: "What does the copy attribute on @property do, and when is it wrong?", a: "copy makes the setter invoke [value copy] before storing — defensive against mutable subclasses (NSString property assigned an NSMutableString would otherwise mutate under you). Use copy for NSString, NSAttributedString, NSArray, NSDictionary, NSSet. Use strong when you explicitly want shared mutability. For NSManagedObject attributes the rules differ — CoreData has its own accessors. copy is incompatible with mutable subclasses (NSMutableArray property with copy silently breaks mutations).", difficulty: "medium" },
    { q: "How do you swizzle a method, and when should you not?", a: "Get the Method for two selectors via class_getInstanceMethod, then method_exchangeImplementations swaps their IMPs. After that, calling selector A runs the IMP of selector B and vice versa. Use for cross-cutting concerns in your own code (logging, metrics). DON'T swizzle framework methods you don't own — breaks across OS versions, surprises other code, makes debugging hellish. Prefer subclassing, categories with prefixed names, or method_setImplementation (more targeted than full exchange).", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Swift", whenThis: "Maintaining legacy Cocoa codebases, C/C++ interop, runtime surgery (swizzling, KVO internals), header-based public API that Swift can't express.", whenThat: "Greenfield Apple apps, anything memory-safe, code needing value types, generics, or pattern matching. Swift is the default since 2014." },
    { vs: "C++", whenThis: "Apple-platform UI work (Cocoa/AppKit/UIKit), dynamic dispatch with nil-safe messaging, header-only public API on Apple platforms.", whenThat: "Cross-platform native code, game engines, performance-critical templated libraries (Eigen, Boost), zero-overhead abstractions." },
    { vs: "Java", whenThis: "Native Mac/iOS apps, tight Cocoa integration, no JVM dependency, smaller runtime footprint.", whenThat: "Cross-platform backend services, enterprise server-side, Android (via Kotlin/Java), anywhere the JVM ecosystem matters." },
    { vs: "Ruby", whenThis: "Compiled native Apple binaries, hard-realtime, mobile/embedded Apple work.", whenThat: "Web backends (Rails), DSLs, scripting, metaprogramming-heavy domains. Ruby's dynamism is at the language level; ObjC's is at the runtime level." },
  ],
};

export default sheet;
