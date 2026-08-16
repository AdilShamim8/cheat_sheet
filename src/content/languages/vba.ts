import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "vba",
  name: "VBA",
  category: "languages",
  tier: 3,
  tags: ["dynamic", "interpreted", "embedded", "office", "macro", "visual-basic", "enterprise"],
  tagline: "Visual Basic for Applications — the scripting layer that powers Excel automation in every finance and ops team on Earth.",
  year: 1993,
  author: "Microsoft",

  tldr: [
    "VBA is Microsoft's dialect of Visual Basic embedded in Office applications (Excel, Word, Access, PowerPoint, Outlook); it ships with the host application, runs in-process, and manipulates the host's object model directly (cells, ranges, documents, mail items).",
    "It is the default tool in investment banking, accounting, supply-chain ops, and any team whose data system IS Excel — automated report generation, model validation, ETL glue between spreadsheets and databases, and CRUD front-ends for Access databases.",
    "Reach for VBA when the business runs on Excel/Access and a Python script with openpyxl won't suffice (you need ribbon buttons, real-time calc hooks, or host-application events), or when maintaining the billions of lines of legacy macro code in production.",
    "Avoid VBA for new standalone software — no package manager, no modern testing, single-threaded, slow, COM-bound. Use Office Scripts (TypeScript, for Excel on the web), Power Query / Power BI, Python with xlwings, or a proper web app.",
  ],

  mentalModel: {
    title: "COM objects, the Excel object model, and `Variant` defaults",
    body: "VBA is built on COM: every Excel 'thing' (Workbook, Worksheet, Range, Chart) is a COM object accessed through properties and methods (`Range(\"A1\").Value = 42`). Variables are `Variant` by default — a tagged union that holds numbers, strings, dates, arrays, object references, or `Empty`/`Null`/`Nothing`/`Null`. Operations on Variants use implicit conversion: `\"5\" + 3` returns `8` (string coerced to number) under some settings and `\"53\"` (string concatenation) under others — the default is `8`, but Option Strict is not available in VBA the way it is in VB.NET. The Excel object model is hierarchical: `Application.Workbooks(\"a.xlsx\").Worksheets(1).Range(\"A1\").Value`. Speed comes from minimizing cross-process COM calls — read/write entire ranges with `.Value2` as a 2D array in ONE call.",
  },

  constructs: [
    { syntax: "Option Explicit", behavior: "Requires every variable to be declared before use — disables implicit declaration.", when: "The first line of EVERY module; non-negotiable for production code." },
    { syntax: "Dim x As Long, s As String, v As Variant", behavior: "Variable declaration; `Long` over `Integer` (16-bit Integer is legacy); `Variant` is default if no type.", when: "All variable declarations; explicit types prevent Variant overhead." },
    { syntax: "Sub DoThing(x As Long)\n  ...\nEnd Sub", behavior: "Subroutine — no return value; arguments passed by reference (`ByRef`) by default.", when: "Macros attached to buttons, all reusable procedures." },
    { syntax: "Function Add(x As Long, y As Long) As Long\n  Add = x + y\nEnd Function", behavior: "Function returning a value; assigned via the function name (not a `return` keyword).", when: "Custom worksheet functions (UDFs), pure transforms." },
    { syntax: "If x > 0 Then ... ElseIf x = 0 Then ... Else ... End If", behavior: "Multi-line conditional; one-liner form `If x Then y` exists but is discouraged.", when: "All branching; Select Case is the multi-branch alternative." },
    { syntax: "For i = 1 To 10 Step 2 ... Next i", behavior: "Counted for-loop with optional step; `For Each x In coll` iterates COM collections.", when: "Index loops, collection iteration; `For Each` is cleaner when you don't need the index." },
    { syntax: "On Error GoTo handler ... Exit Sub\nhandler: ...", behavior: "Structured error handling — single active handler per scope; `Resume` retries, `Resume Next` skips.", when: "All non-trivial procedures; the only error mechanism in VBA." },
    { syntax: "Dim arr() As Long\nReDim arr(1 To N)", behavior: "Dynamic array — `ReDim Preserve arr(1 To N+1)` grows but only the last dim.", when: "Variable-size lists; `Collection` is more flexible for arbitrary grow/shrink." },
    { syntax: "Dim d As Object: Set d = CreateObject(\"Scripting.Dictionary\")", behavior: "Late-bound dictionary — adds key/value pairs, `.Exists` checks membership.", when: "Hash maps; the built-in Collection only does string-keyed lookups poorly." },
    { syntax: "Range(\"A1:B10\").Value2 = myArray", behavior: "Bulk write — assigns a 2D Variant array to a range in ONE COM call.", when: "The single biggest perf lever in Excel VBA — avoid cell-by-cell loops." },
    { syntax: "With Worksheets(1).Range(\"A1\")\n  .Value = 1\n  .Font.Bold = True\nEnd With", behavior: "With block — shortens repeated member access on one object; minor perf win.", when: "Any sequence of operations on the same COM object." },
    { syntax: "Public Property Get X() As Long\n  X = m_X\nEnd Property", behavior: "Property procedure — exposes state with get/let/set; classes use these.", when: "Class modules; the VBA OOP pattern." },
  ],

  patterns: [
    {
      lang: "vba",
      caption: "Bulk read/write with 2D Variant — the #1 Excel VBA pattern",
      code: `Option Explicit

Public Sub ProcessRange()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Data")

    Dim rng As Range
    Set rng = ws.Range("A2:D1001")   ' 1000 rows, 4 cols

    ' ONE COM call: read the entire range into a 2D Variant array.
    Dim data As Variant
    data = rng.Value2                 ' 1-based: data(1..1000, 1..4)

    Dim i As Long, total As Double
    For i = LBound(data, 1) To UBound(data, 1)
        If IsNumeric(data(i, 2)) Then
            total = total + CDbl(data(i, 2))
            data(i, 4) = CDbl(data(i, 2)) * 1.1   ' mark up column D
        End If
    Next i

    ' ONE COM call: write the entire array back.
    rng.Value2 = data
    Debug.Print "total: " & total
End Sub`,
    },
    {
      lang: "vba",
      caption: "Structured error handling — the only correct pattern",
      code: `Option Explicit

Public Sub ImportFile(ByVal path As String)
    On Error GoTo handler
    Dim wb As Workbook
    Set wb = Workbooks.Open(path, ReadOnly:=True)

    ' ... do work ...

CleanUp:
    On Error Resume Next               ' swallow errors during cleanup
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
    Exit Sub                            ' MUST come before handler label

handler:
    Dim msg As String
    msg = "Error " & Err.Number & ": " & Err.Description
    Select Case Err.Number
        Case 1004: msg = msg & vbCrLf & "(file not found or locked?)"
        Case Else: ' fall through
    End Select
    MsgBox msg, vbExclamation, "ImportFile"
    Resume CleanUp                      ' jump to cleanup, then exit
End Sub`,
    },
    {
      lang: "vba",
      caption: "Class module — encapsulating business objects",
      code: `' Class module: Customer
Option Explicit

Private m_Id As Long
Private m_Name As String
Private m_Balance As Double

Public Property Get Id() As Long:    Id = m_Id:        End Property
Public Property Let Id(v As Long):   m_Id = v:         End Property
Public Property Get Name() As String: Name = m_Name:   End Property
Public Property Let Name(v As String): m_Name = v:     End Property

Public Function Charge(amount As Double) As Double
    If amount < 0 Then Err.Raise 5, "Customer.Charge", "negative amount"
    m_Balance = m_Balance + amount
    Charge = m_Balance
End Function

' Usage in a standard module:
'   Dim c As Customer
'   Set c = New Customer
'   c.Id = 1: c.Name = "Acme"
'   Debug.Print c.Charge(100)`,
    },
    {
      lang: "vba",
      caption: "Dictionary for deduplication — late-bound to avoid reference issues",
      code: `Option Explicit

Public Sub UniqueCounts()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Sheet1")
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row

    Dim data As Variant
    data = ws.Range("A1:A" & lastRow).Value2

    ' Late-bound Scripting.Dictionary — no Tools > References needed.
    Dim counts As Object
    Set counts = CreateObject("Scripting.Dictionary")
    counts.CompareMode = 1   ' TextCompare (case-insensitive)

    Dim i As Long, key As String
    For i = 1 To UBound(data, 1)
        key = CStr(data(i, 1))
        If Not counts.Exists(key) Then counts.Add key, 0
        counts(key) = counts(key) + 1
    Next i

    ' Output unique keys + counts to a new sheet.
    Dim out As Worksheet
    Set out = ThisWorkbook.Worksheets.Add
    out.Range("A1:B1").Value = Array("Key", "Count")
    out.Range("A2").Resize(counts.Count, 1).Value = _
        Application.Transpose(counts.Keys)
    out.Range("B2").Resize(counts.Count, 1).Value = _
        Application.Transpose(counts.Items)
End Sub`,
    },
  ],

  pitfalls: [
    {
      title: "Cell-by-cell loops — 1000x slower than bulk array",
      symptom: "Writing `For i = 1 To 10000: Cells(i, 1).Value = i: Next i` takes 30+ seconds; the same with a 2D Variant array takes 50ms. Each `.Value` access is a cross-process COM round-trip.",
      fix: "Read the whole range into a 2D Variant (`data = rng.Value2`), mutate the array, write it back (`rng.Value2 = data`). Disable screen updating (`Application.ScreenUpdating = False`) and calculation (`Application.Calculation = xlCalculationManual`) for the duration of the macro.",
    },
    {
      title: "Variant by default — silent type coercion bugs",
      symptom: "`x = \"5\" + 3` returns `8` (numeric add) in most environments but `\"53\"` (concat) when Option Strict-ish settings differ. `Empty + 5` returns `5`. Comparing `Null` to anything returns `Null`, not True/False.",
      fix: "Always `Option Explicit` and declare explicit types (`Dim x As Long`). Never use Variant for numerics. Use `IsNumeric`, `IsNull`, `IsEmpty`, `IsNothing` to test before operating. Consistency beats cleverness.",
    },
    {
      title: "ByRef default — arguments silently mutated",
      symptom: "Sub `Foo(x)` modifies `x`; the caller's variable changes too because VBA defaults to `ByRef`. Refactoring to add a return value can introduce spooky-action-at-a-distance bugs.",
      fix: "Mark args `ByVal` explicitly unless you genuinely want output parameters. Use parentheses at the call site (`Foo (x)`) forces a ByVal copy, but it's clearer to declare the parameter ByVal in the signature.",
    },
    {
      title: "1-indexed arrays (and `Option Base 1`)",
      symptom: "`Dim a(10)` gives indices 0..10 (11 elements) by default; `Option Base 1` makes it 1..10. Mixing modules with different bases gives off-by-one bugs that are nearly impossible to spot.",
      fix: "Always use explicit bounds: `Dim a(1 To 10)`. Avoid `Option Base` entirely — make every array's bounds visible at the declaration. `.Value2` from Excel always returns 1-based arrays regardless.",
    },
    {
      title: "Integer overflow — use Long, not Integer",
      symptom: "`Integer` in VBA is 16-bit (-32768..32767); a row counter past 32767 overflows silently or raises a runtime error. Beginners use Integer because it sounds small.",
      fix: "Use `Long` (32-bit signed) for all integer work. There's no LongLong in 32-bit VBA — for >2 billion use `Currency` or `Decimal` (via CDec). VBA7 introduced `LongPtr` for handle compatibility with 64-bit Office.",
    },
    {
      title: "Late binding vs early binding — reference breakage",
      symptom: "Code with `Tools > References > Microsoft Scripting Runtime` checked uses `Dim d As New Dictionary` (early binding, fast, IntelliSense). Sending the file to a colleague without the reference fails to compile.",
      fix: "Use late binding (`CreateObject(\"Scripting.Dictionary\")`, `Dim d As Object`) for any non-Office COM component to avoid reference issues. Keep early binding for development, switch to late binding before distribution. Test both.",
    },
    {
      title: "Error handling that swallows everything",
      symptom: "`On Error Resume Next` left on disables ALL error reporting — a typo in `Range(\"Z100\").Value = x` silently does nothing, and you spend hours wondering why the cell is empty.",
      fix: "Use `On Error GoTo <label>` with a real handler. Use `On Error Resume Next` only for one specific expected failure, immediately followed by `If Err.Number <> 0 Then ...` and `On Error GoTo 0` to re-enable normal handling. Never leave Resume Next on across a whole procedure.",
    },
  ],

  quickReference: [
    { fact: "VBA7 (Office 2010+) introduced 64-bit support via LongPtr; Office 2019 / 365 ship VBA7.1. No new language features since ~2010 — Microsoft is investing in Office Scripts (TypeScript) instead.", tag: "version" },
    { fact: "Office Scripts (TypeScript, web-only) and Power Query (M language) are Microsoft's modern replacements for VBA in Excel — but VBA remains the only option for desktop-only automation and complex host events.", tag: "version" },
    { fact: "Excel COM calls are the #1 perf bottleneck. A bulk read of 10k cells via .Value2 is ~10ms; cell-by-cell loop is 1-5s. 100x difference.", tag: "perf" },
    { fact: "Application.ScreenUpdating = False + Application.Calculation = xlCalculationManual during macro execution gives 5-20x speedup on worksheet-modifying code.", tag: "perf" },
    { fact: "Integer is 16-bit (-32768..32767); Long is 32-bit. Always use Long for row counters — Excel rows > 1M overflow Integer.", tag: "gotcha" },
    { fact: "Variant is 16 bytes and holds any type with implicit conversion; declaring explicit types (Long, String, Double) is faster and safer.", tag: "perf" },
    { fact: ".Value2 is faster than .Value — .Value checks cell formatting and may apply currency/date conversion; .Value2 returns raw underlying numbers.", tag: "perf" },
    { fact: "Arrays from .Value2 are always 2D and 1-based, even for a single cell (data(1,1)). Use LBound/UBound to iterate safely.", tag: "gotcha" },
    { fact: "Default parameter passing is ByRef (caller's variable is mutable). Use ByVal explicitly to prevent accidental mutation.", tag: "gotcha" },
    { fact: "Collection (built-in) is 1-indexed and slow; Scripting.Dictionary (COM) supports arbitrary keys and Exists() — late-bound via CreateObject.", tag: "complexity" },
    { fact: "Custom functions (UDFs) in VBA cannot modify cells, run macros, or trigger events — they must be pure. Use a Sub for any side effect.", tag: "gotcha" },
    { fact: "VBA has no package manager; sharing code means exporting .bas/.cls files and re-importing. VBE add-ins (like Rubberduck) provide refactoring and unit testing.", tag: "style" },
    { fact: "Naming: PascalCase for subs/functions/properties, camelCase for locals, m_ prefix for module-level private vars in classes. Hungarian notation (strName, lngCount) is legacy but still common.", tag: "style" },
    { fact: "Trust Center > Macro Settings controls whether unsigned macros run; digitally sign VBA projects (VBA SDK) for enterprise distribution to avoid scary warning prompts.", tag: "version" },
    { fact: "xlwings (Python) and Excel-DNA (C#) are popular alternatives — they call the same COM object model from a saner language, with modern tooling. Worth considering for new add-ins.", tag: "version" },
  ],

  goDeeper: [
    { title: "Microsoft VBA Language Reference", url: "https://learn.microsoft.com/en-us/office/vba/language/reference/", note: "Official reference for syntax, keywords, and the Visual Basic Editor. The Excel Object Model reference is the other half." },
    { title: "Excel Object Model Overview", url: "https://learn.microsoft.com/en-us/office/vba/api/overview/excel", note: "The COM hierarchy — Application > Workbooks > Worksheets > Range — that every Excel VBA program navigates." },
    { title: "Rubberduck VBA", url: "https://rubberduckvba.com/", note: "Open-source VBE add-in: unit testing, refactoring, code inspections, source-control export. The single biggest quality-of-life upgrade for VBA devs." },
    { title: "Excel Macro Mastery (Paul Kelly)", url: "https://excelmacromastery.com/", note: "Free blog + paid courses; the most thorough modern VBA tutorial online, with the array-vs-cell performance chapter being essential." },
    { title: "VBA Developer's Handbook (Ken Getz & Mike Gilbert)", url: "https://www.oreilly.com/library/view/vba-developers-handbook/0782123290/", note: "The reference book on VBA patterns, class design, and Windows API calls. Some sections are dated but the API design chapters still apply." },
  ],

  // ─── §8 Data Types Deep Dive ────────────────────────────────────────
  dataTypes: {
    primitives: [
      { syntax: "Dim b As Byte", behavior: "8-bit unsigned (0-255). Smallest type; used for binary I/O and byte arrays.", when: "Binary data, byte arrays for API calls. Arithmetic promotes to Integer." },
      { syntax: "Dim i As Integer", behavior: "16-bit signed (-32768..32767). Legacy — slower than Long on 32-bit+ CPUs.", when: "Don't use for new code; use Long. Required for some API structures." },
      { syntax: "Dim n As Long", behavior: "32-bit signed. The default integer for modern VBA.", when: "All integer work — row counters, loop indices, IDs. Excel rows > 32767 require Long." },
      { syntax: "Dim h As LongLong", behavior: "64-bit signed (VBA7+ on 64-bit Office only; use #If Win64 conditional).", when: "Large file sizes, hash values, Windows API handles on 64-bit. LongPtr auto-adapts." },
      { syntax: "Dim s As Single", behavior: "32-bit IEEE 754 float (~7 digits).", when: "Rare in business code; use Double for all floating-point work." },
      { syntax: "Dim d As Double", behavior: "64-bit IEEE 754 float (~15-16 digits). Default for floating-point.", when: "All real-number math, financial calculations (or Currency for money)." },
      { syntax: "Dim c As Currency", behavior: "64-bit scaled integer (4 decimal places, range ~±9.2e14).", when: "Money. No float rounding errors — exact decimal arithmetic." },
      { syntax: "Dim v As Variant: v = CDec(\"1.23\")", behavior: "Decimal subtype of Variant — 96-bit scaled integer, up to 28-29 significant digits. No first-class Decimal type.", when: "High-precision money, scientific constants. Lives only inside Variant." },
      { syntax: "Dim s As String", behavior: "Variable-length string. Fixed-length String * N exists but is rare.", when: "All text. Concatenation in loops is O(n^2) — use StringBuilder pattern." },
      { syntax: "Dim b As Boolean", behavior: "16-bit integer; True = -1 (all bits set), False = 0. Different from C#/Python (True = 1).", when: "Logic flags. Implicit conversion: any nonzero number is True." },
      { syntax: "Dim dt As Date", behavior: "8-byte double — days since 1899-12-30 (the Excel epoch). Time is fractional day.", when: "Dates, timestamps. Use DateSerial/TimeSerial to construct; DateAdd for arithmetic." },
      { syntax: "Dim v As Variant", behavior: "Tagged union — holds any type. Default if no As clause. 16+ bytes overhead.", when: "When you must (late binding, .Value2 from ranges). Avoid for typed math." },
    ],
    collections: [
      { syntax: "Dim a(1 To 10) As Long", behavior: "Fixed-size array — bounds set at declaration; cannot resize. Always 1-based here.", when: "Known-size buffers. Avoid Option Base 1 — make bounds explicit." },
      { syntax: "Dim a() As Long\nReDim a(1 To N)", behavior: "Dynamic array — ReDim resizes (clears values); ReDim Preserve grows but only the LAST dimension.", when: "Variable-size lists. Preserve is O(n) — preallocate when possible." },
      { syntax: "Dim c As New Collection", behavior: "Built-in 1-indexed collection — Add/Remove/Item/Count. Key is String, optional.", when: "Ordered lists with optional keys. Slow vs Dictionary for keyed lookup." },
      { syntax: "Dim d As Object\nSet d = CreateObject(\"Scripting.Dictionary\")", behavior: "Late-bound hash map — Keys/Items/Exists/Add/Remove. CompareMode for case sensitivity.", when: "Hash maps, dedup, grouping. Faster than Collection for key lookup." },
      { syntax: "Dim rng As Range\nSet rng = ws.Range(\"A1:B10\")", behavior: "Excel COM range — cells, rows, columns. The primary data structure in Excel VBA.", when: "All Excel automation. Use .Value2 for bulk read/write, NOT cell-by-cell." },
      { syntax: "Dim data As Variant\ndata = rng.Value2", behavior: "2D 1-based Variant array — the bulk read pattern. Always 2D even for one row/column.", when: "Reading ranges. Iterate with LBound/UBound — never assume 0-based." },
      { syntax: "Dim list As Object\nSet list = CreateObject(\"System.Collections.ArrayList\")", behavior: ".NET ArrayList via COM — dynamic array with Add/Remove/Sort/Contains. Late-bound only.", when: "When you need a real growable typed list (VBA arrays are clunky)." },
      { syntax: "Dim rs As Object\nSet rs = CreateObject(\"ADODB.Recordset\")", behavior: "ADO Recordset — cursor over SQL query results. MoveNext/EOF/Fields.", when: "Database access. Late-bound avoids reference breakage across machines." },
    ],
    custom: [
      { syntax: "Type Point\n  x As Double\n  y As Double\nEnd Type", behavior: "User-Defined Type (UDT) — value-type struct. Fast, no heap allocation. Cannot be public in standard modules.", when: "Small fixed records. Use Class for behavior; Type for plain data." },
      { syntax: "' Class module: Customer\nPrivate m_Id As Long\nPublic Property Get Id() As Long", behavior: "Class module — reference type with encapsulation, properties, methods. Instantiated via New.", when: "Domain objects with behavior. VBA's OOP workhorse (no inheritance, only Implements)." },
      { syntax: "Enum StatusCode\n  stOK = 0\n  stError = 1\n  stRetry = 2\nEnd Enum", behavior: "Named integer constants — strongly typed. Public in standard modules.", when: "Closed sets of values. Replaces magic numbers; IntelliSense works." },
      { syntax: "Public Property Get X() As Long\nPublic Property Let X(v As Long)\nPublic Property Set X(v As Object)", behavior: "Property procedures — get/let (value)/set (object) provide controlled access to private fields.", when: "Class encapsulation. Let for value types, Set for objects." },
      { syntax: "Implements IComparable", behavior: "Interface implementation — VBA's only polymorphism. Class must implement every method of the interface.", when: "Strategy/plugin patterns. No inheritance — only interface dispatch." },
      { syntax: "Public Event Changed(ByVal field As String)\nDim WithEvents src As EventSource", behavior: "Custom events — class can raise; consumer declares WithEvents to handle. Compile-time binding.", when: "Observer pattern in userforms, async callbacks." },
      { syntax: "' Standard module (.bas)\nPublic Sub GlobalHelper()", behavior: "Standard module — global subs/funcs, no instantiation needed. Public = visible project-wide.", when: "Macros attached to buttons, utility functions, the entry points." },
      { syntax: "Friend Sub InternalMethod()", behavior: "Friend — visible to other modules in the same project but not externally. Rare.", when: "Internal API surface of a class; uncommon in practice." },
    ],
  },

  // ─── §9 Operators ──────────────────────────────────────────────────
  operators: [
    { syntax: "a + b, a - b, a * b, a / b", behavior: "Arithmetic — / always returns Double (even for integers). Use \\ for integer division.", when: "All numeric math. Currency/Decimal avoid float rounding." },
    { syntax: "a \\ b", behavior: "Integer division — operands rounded to Long, result truncated. 7 \\ 2 = 3.", when: "Integer-only division. Different from / which always returns Double." },
    { syntax: "a Mod b", behavior: "Modulo — remainder of integer division. 7 Mod 3 = 1. Operands rounded to Long.", when: "Cyclic indexing, even/odd tests, modular arithmetic." },
    { syntax: "a ^ b", behavior: "Exponentiation — returns Double. 2 ^ 10 = 1024.", when: "Powers. For squares use a * a (faster, exact)." },
    { syntax: "a = b (assignment) / a = b (equality)", behavior: "Same token for assignment and equality — context-dependent. Source of classic bugs (if x = 5 vs x = 5).", when: "Assignment: x = 5. Equality: If x = 5 Then. No == operator." },
    { syntax: "a <> b", behavior: "Inequality. The VBA spelling of !=.", when: "All not-equal comparisons." },
    { syntax: "a < b, a > b, a <= b, a >= b", behavior: "Relational — string comparison uses Option Compare (Binary default, Text optional).", when: "All ordering comparisons. Use StrComp for explicit comparison mode." },
    { syntax: "a Is b, a Is Nothing", behavior: "Object identity — True if both refer to the same object. The ONLY correct Nothing test.", when: "Checking Nothing, comparing object references. NEVER use = for objects." },
    { syntax: "s Like \"abc*\"", behavior: "Pattern match — wildcards: * (any), ? (one char), # (digit), [abc] / [!abc] (char class).", when: "Simple patterns. For real regex use VBScript.RegExp via COM." },
    { syntax: "a And b, a Or b, a Not b", behavior: "Logical AND/OR/NOT — bitwise on integers, logical on Boolean. Always evaluate both sides (no short-circuit).", when: "Boolean logic. No short-circuit is a gotcha — use nested Ifs for short-circuit." },
    { syntax: "a Xor b, a Eqv b, a Imp b", behavior: "Bitwise XOR / equivalence / implication. Eqv and Imp are rare legacy operators.", when: "Bit manipulation. Eqv/Imp are footguns — almost never what you want." },
    { syntax: "s1 & s2", behavior: "String concatenation. & forces string conversion; + may add numerically.", when: "ALWAYS use & for strings. + on mixed types is a coercion bug." },
    { syntax: "obj.member, obj!field", behavior: ". = explicit member access; ! = bang (default member access, e.g., rs!Name = rs.Fields(\"Name\").Value).", when: ". for typed access; ! for COM collections/recordsets. Prefer . for clarity." },
  ],

  // ─── §10 Input / Output ────────────────────────────────────────────
  inputOutput: [
    {
      lang: "vba",
      caption: "Sequential text file I/O — the classic VBA pattern",
      code: `Option Explicit

Public Sub WriteLog(ByVal path As String, ByVal msg As String)
    Dim f As Integer
    f = FreeFile                      ' get a free file number
    Open path For Append As #f        ' Append = add to end; Output = overwrite
    Print #f, Format$(Now, "yyyy-mm-dd hh:nn:ss") & vbTab & msg
    Close #f                          ' ALWAYS close — unclosed files leak handles
End Sub

Public Function ReadLines(ByVal path As String) As String()
    Dim f As Integer, line As String, lines() As String
    Dim n As Long: n = 0
    ReDim lines(1 To 1024)
    f = FreeFile
    Open path For Input As #f
    Do Until EOF(f)
        Line Input #f, line           ' read one line, no trailing newline
        n = n + 1
        If n > UBound(lines) Then ReDim Preserve lines(1 To n * 2)
        lines(n) = line
    Loop
    Close #f
    If n > 0 Then ReDim Preserve lines(1 To n) Else Erase lines
    ReadLines = lines
End Sub

! Print # = unquoted output; Write # = quoted/escaped CSV-friendly.
! Line Input # = read whole line; Input # = comma-parsed fields.`,
    },
    {
      lang: "vba",
      caption: "FileSystemObject — modern file ops via late-bound COM",
      code: `Option Explicit

Public Sub ListFiles(ByVal dir As String, ByVal pattern As String)
    ' Late-bound — no Tools > References needed; portable across machines.
    Dim fso As Object, folder As Object, file As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FolderExists(dir) Then
        Err.Raise 53, , "Folder not found: " & dir
    End If
    Set folder = fso.GetFolder(dir)
    For Each file In folder.Files
        If LCase$(file.Name) Like LCase$(pattern) Then
            Debug.Print file.Name, file.Size, file.DateLastModified
        End If
    Next file
End Sub

Public Sub SafeCopy(ByVal src As String, ByVal dst As String)
    Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
    If Not fso.FileExists(src) Then Err.Raise 53, , "src missing"
    If fso.FileExists(dst) Then fso.DeleteFile dst, True   ' force
    fso.CopyFile src, dst
End Sub

! FSO gives Folder/File objects with rich properties (Size, Dates, Attributes).
! Open/Print # is faster for line-by-line text I/O; FSO is cleaner for
! filesystem manipulation (move/copy/exists).`,
    },
    {
      lang: "vba",
      caption: "ADO database query — read SQL Server / Access",
      code: `Option Explicit

Public Function QueryToRows(ByVal connStr As String, ByVal sql As String) As Variant
    ' Returns a 2D Variant array (rows x cols), or Empty if no rows.
    Dim conn As Object, rs As Object
    On Error GoTo handler
    Set conn = CreateObject("ADODB.Connection")
    Set rs = CreateObject("ADODB.Recordset")
    conn.Open connStr
    rs.Open sql, conn, 0, 1       ' 0=adOpenForwardOnly, 1=adLockReadOnly

    If rs.EOF Then
        QueryToRows = Empty
    Else
        QueryToRows = rs.GetRows()    ' transposed: cols x rows
        ' Caller must Application.Transpose() to get rows x cols.
    End If

CleanUp:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    If Not conn Is Nothing Then conn.Close
    Exit Function
handler:
    Err.Raise Err.Number, "QueryToRows", Err.Description
    Resume CleanUp
End Function

' Connection strings:
'   SQL Server:  "Provider=SQLOLEDB;Data Source=...;Initial Catalog=...;User Id=...;Password=..."
'   Access .accdb: "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=C:\db.accdb"
'   Excel:       "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=book.xlsx;Extended Properties=""Excel 12.0"""
'
' ALWAYS use parameters (cmd.Parameters.Append) for user input — never
' concatenate strings into SQL. SQL injection is real in VBA too.`,
    },
    {
      lang: "vba",
      caption: "Registry + WScript.Shell — persist user settings",
      code: `Option Explicit

Public Sub SaveSetting2(ByVal key As String, ByVal value As String)
    ' WScript.Shell reads/writes HKCU\Software\VB and VBA Program Settings\
    Dim sh As Object: Set sh = CreateObject("WScript.Shell")
    sh.RegWrite "HKCU\Software\MyApp\" & key & "\", value, "REG_SZ"
End Sub

Public Function LoadSetting2(ByVal key As String, ByVal def As String) As String
    Dim sh As Object: Set sh = CreateObject("WScript.Shell")
    On Error Resume Next              ' key may not exist on first run
    LoadSetting2 = sh.RegRead("HKCU\Software\MyApp\" & key & "\")
    If Err.Number <> 0 Then LoadSetting2 = def
    On Error GoTo 0
End Function

' Built-in GetSetting/SaveSetting do the same thing but only under
' "VB and VBA Program Settings" — WScript.Shell gives full HKCU/HKLM access.
' Use the registry (or a config file) for user preferences; don't pollute
' the workbook with hidden sheets.`,
    },
  ],

  // ─── §11 Loops & Iteration ─────────────────────────────────────────
  loops: [
    {
      lang: "vba",
      caption: "For...Next with Step + nested + Exit For",
      code: `Option Explicit

Public Sub ForNextDemo()
    Dim i As Long, j As Long, total As Long

    ' Step is optional (default 1); can be negative.
    For i = 10 To 1 Step -1
        Debug.Print i
    Next i

    ' Nested loops with early exit on condition.
    For i = 1 To 10
        For j = 1 To 10
            If i * j > 50 Then Exit For     ' breaks inner loop only
            total = total + i * j
        Next j
    Next i
    Debug.Print "total:", total
End Sub

' Exit For breaks ONE loop. To break outer from inner, use a flag or GoTo.
' Next i is the idiomatic form (with variable); Next alone is also legal.`,
    },
    {
      lang: "vba",
      caption: "For Each — iterate COM collections + Dictionary",
      code: `Option Explicit

Public Sub ForEachDemo()
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        Debug.Print ws.Name, ws.Range("A1").Value
    Next ws

    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
    d.Add "apple", 1: d.Add "banana", 2

    Dim key As Variant
    For Each key In d.Keys           ' Keys returns a Variant array
        Debug.Print key, d(key)
    Next key

    ' For Each is read-only on the element variable. To mutate, use index:
    '   For i = LBound(arr) To UBound(arr): arr(i) = ... : Next i
End Sub`,
    },
    {
      lang: "vba",
      caption: "Do While / Do Until / Loop — pre-test and post-test",
      code: `Option Explicit

Public Sub DoLoopDemo()
    Dim i As Long: i = 0

    ' Pre-test Do While — runs 0+ times.
    Do While i < 5
        Debug.Print i
        i = i + 1
    Loop

    ' Post-test Do ... Loop While — runs 1+ times.
    i = 0
    Do
        Debug.Print i
        i = i + 1
    Loop While i < 5

    ' Do Until — same as Do While Not (condition).
    i = 0
    Do Until i >= 5
        i = i + 1
    Loop

    ' Exit Do breaks out — like Exit For for For loops.
End Sub

' While ... Wend is the legacy form (pre-VBA). Do ... Loop is preferred —
' it supports Exit Do and Until, While ... Wend does not.`,
    },
    {
      lang: "vba",
      caption: "Line-numbered / GoTo loop — legacy but still appears",
      code: `Option Explicit

Public Sub GoToLoopDemo()
    Dim i As Long
    i = 1
nextIter:
    Debug.Print i
    i = i + 1
    If i <= 5 Then GoTo nextIter

    ' GoTo is the ONLY way to break out of a NESTED loop in one step.
    Dim j As Long
    For i = 1 To 10
        For j = 1 To 10
            If i * j > 30 Then GoTo done     ' breaks BOTH loops
        Next j
    Next i
done:
    Debug.Print "exited at i=" & i & ", j=" & j
End Sub

' GoTo is discouraged except for: (1) error handling (On Error GoTo label),
' (2) breaking out of nested loops, (3) centralizing cleanup. Don't use
' it to replace For/Do — it makes code unreadable.`,
    },
  ],

  // ─── §12 Functions & Callables ─────────────────────────────────────
  functions: [
    {
      lang: "vba",
      caption: "Sub + Function with Optional, ByVal, ByRef, defaults",
      code: `Option Explicit

Public Sub ShowMessage(ByVal name As String, Optional ByVal times As Long = 1)
    ' ByVal = caller's value is copied (safe). ByRef (default) = caller's
    ' variable is mutable. ALWAYS mark ByVal unless you want output params.
    Dim i As Long
    For i = 1 To times
        Debug.Print "Hello, " & name
    Next i
End Sub

Public Function BuildPath(ByVal dir As String, ParamArray parts() As Variant) As String
    ' ParamArray = variadic — must be last, always ByVal Variant.
    Dim p As Variant, result As String
    result = dir
    For Each p In parts
        result = result & "\" & CStr(p)
    Next p
    BuildPath = result
End Function

Public Sub CallDemo()
    ShowMessage "Alice"                  ' times defaults to 1
    ShowMessage "Bob", 3                 ' explicit second arg
    Debug.Print BuildPath("C:", "Users", "alice", "Docs", "file.txt")
End Sub

' Function return value is assigned via the function name (or Exit Function).
' The function name is also a local variable — read/write it inside.`,
    },
    {
      lang: "vba",
      caption: "Property procedures — encapsulated state with validation",
      code: `' Class module: Temperature
Option Explicit

Private m_Kelvin As Double

Public Property Get Kelvin() As Double
    Kelvin = m_Kelvin
End Property

Public Property Let Kelvin(ByVal v As Double)
    If v < 0 Then Err.Raise vbObjectError + 513, "Temperature", "below absolute zero"
    m_Kelvin = v
End Property

Public Property Get Celsius() As Double
    Celsius = m_Kelvin - 273.15
End Property

Public Property Let Celsius(ByVal v As Double)
    If v < -273.15 Then Err.Raise vbObjectError + 513, "Temperature", "below absolute zero"
    m_Kelvin = v + 273.15
End Property

Public Property Get Fahrenheit() As Double
    Fahrenheit = m_Kelvin * 9 / 5 - 459.67
End Property

' Usage:
'   Dim t As Temperature: Set t = New Temperature
'   t.Celsius = 25
'   Debug.Print t.Fahrenheit     ' 77
'   t.Celsius = -300             ' raises error 513

' Property Let = for value types, Property Set = for objects.
' Properties let you validate, log, or compute on access — a public
' field would not.`,
    },
    {
      lang: "vba",
      caption: "Recursion + ParamArray — factorial + SQL IN clause builder",
      code: `Option Explicit

Public Function Factorial(ByVal n As Long) As Long
    If n < 0 Then Err.Raise 5, "Factorial", "negative input"
    If n <= 1 Then
        Factorial = 1
    Else
        Factorial = n * Factorial(n - 1)
    End If
End Function

Public Function BuildInClause(ByVal field As String, ParamArray values() As Variant) As String
    ' Build "field IN (v1, v2, v3)" with proper quoting.
    Dim v As Variant, parts() As String, n As Long
    If UBound(values) < 0 Then
        BuildInClause = field & " IN (NULL)"   ' matches nothing
        Exit Function
    End If
    ReDim parts(0 To UBound(values))
    For Each v In values
        If IsNumeric(v) Then
            parts(n) = CStr(v)
        Else
            parts(n) = "'" & Replace(CStr(v), "'", "''") & "'"  ' escape quotes
        End If
        n = n + 1
    Next v
    BuildInClause = field & " IN (" & Join(parts, ", ") & ")"
End Function

Public Sub Demo()
    Debug.Print Factorial(10)         ' 3628800
    Debug.Print BuildInClause("status", "open", "pending", "review")
    ' status IN ('open', 'pending', 'review')
End Sub

' VBA has no tail-call optimization — deep recursion will stack overflow.
' Convert to iteration for n > ~5000.`,
    },
    {
      lang: "vba",
      caption: "Declare — call Windows API (Sleep, GetTickCount)",
      code: `Option Explicit

' 64-bit-safe declares: use LongPtr for handles/pointers (auto-adapts).
#If VBA7 Then
    Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal ms As LongPtr)
    Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As LongPtr
#Else
    Private Declare Sub Sleep Lib "kernel32" (ByVal ms As Long)
    Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If

Public Sub WaitMs(ByVal ms As Long)
    ' Sleep pauses the thread WITHOUT yielding to Excel by default.
    ' Pair with DoEvents to keep the UI responsive during long waits.
    Dim start As LongPtr: start = GetTickCount()
    Do While GetTickCount() - start < ms
        Sleep 10
        DoEvents
    Loop
End Sub

Public Sub Demo()
    WaitMs 500              ' wait 500ms, UI stays responsive
    Debug.Print "done"
End Sub

' ALWAYS use PtrSafe + LongPtr in #If VBA7 blocks — otherwise the declare
' fails on 64-bit Office. The Win32 API docs at pinvoke.net are the source.`,
    },
  ],

  // ─── §13 Error Handling ────────────────────────────────────────────
  errorHandling: [
    {
      lang: "vba",
      caption: "Err.Raise + vbObjectError — custom errors with proper codes",
      code: `Option Explicit

Public Const ERR_BAD_INPUT As Long = vbObjectError + 513
Public Const ERR_NOT_FOUND As Long = vbObjectError + 514

Public Function ParseAmount(ByVal s As String) As Double
    ' vbObjectError (0x800A0000+) marks the error as user-defined so it
    ' doesn't collide with VB runtime errors (which are < 0x800A0000).
    If Len(s) = 0 Then
        Err.Raise ERR_BAD_INPUT, "ParseAmount", "empty input"
    End If
    If Not IsNumeric(s) Then
        Err.Raise ERR_BAD_INPUT, "ParseAmount", "not numeric: " & s
    End If
    ParseAmount = CDbl(s)
End Function

Public Sub Demo()
    On Error GoTo handler
    Dim amt As Double
    amt = ParseAmount("abc")
    Exit Sub
handler:
    Select Case Err.Number
        Case ERR_BAD_INPUT
            MsgBox "Bad input: " & Err.Description, vbExclamation
        Case ERR_NOT_FOUND
            MsgBox "Not found", vbExclamation
        Case Else
            MsgBox "Unexpected " & Err.Number & ": " & Err.Description, vbCritical
    End Select
End Sub

' Err.Raise Source: the procedure name (used for tracing).
' Err.Raise Description: human-readable message.
' Err.Raise Number: vbObjectError + your_code (use 513+ for user errors).`,
    },
    {
      lang: "vba",
      caption: "On Error Resume Next — targeted one-shot pattern",
      code: `Option Explicit

Public Function SafeDivision(ByVal a As Double, ByVal b As Double, ByRef result As Double) As Boolean
    ' Returns True if division succeeded, False otherwise. No exception raised.
    On Error Resume Next              ' temporarily suppress errors
    result = a / b                    ' may divide by zero
    If Err.Number <> 0 Then
        SafeDivision = False
        Err.Clear                     ' MUST clear before re-enabling
    Else
        SafeDivision = True
    End If
    On Error GoTo 0                   ' re-enable normal handling IMMEDIATELY
End Function

Public Sub Demo()
    Dim r As Double
    If SafeDivision(10, 0, r) Then
        Debug.Print r
    Else
        Debug.Print "division failed"
    End If
End Sub

' On Error Resume Next is dangerous left on — every subsequent line that
' errors is silently ignored. Use it ONLY for one operation, then check
' Err.Number and reset with On Error GoTo 0.`,
    },
    {
      lang: "vba",
      caption: "Centralized error logger — write to file + Immediate",
      code: `Option Explicit

Public Sub LogError(ByVal procName As String, Optional ByVal module As String = "")
    Dim msg As String
    msg = "[" & Format$(Now, "yyyy-mm-dd hh:nn:ss") & "] " _
        & IIf(Len(module) > 0, module & ".", "") & procName _
        & " Err " & Err.Number & ": " & Err.Description

    Debug.Print msg                   ' always to Immediate window

    Dim f As Integer: f = FreeFile
    On Error Resume Next              ' log failure must not raise
    Open ThisWorkbook.Path & "\error.log" For Append As #f
    Print #f, msg
    Close #f
    On Error GoTo 0
End Sub

Public Sub RiskyOperation()
    On Error GoTo handler
    Dim x As Double
    x = 1 / 0                         ' raises error 11
    Exit Sub
handler:
    LogError "RiskyOperation", "Module1"
    Err.Raise Err.Number, Err.Source, Err.Description   ' re-raise to caller
End Sub

' Pattern: catch locally, log centrally, re-raise to propagate.
' The caller can then decide whether to retry, abort, or show user.`,
    },
    {
      lang: "vba",
      caption: "Nested error handling — chain Source for stack traces",
      code: `Option Explicit

Public Sub TopLevel()
    On Error GoTo handler
    CallLevel1
    Exit Sub
handler:
    Debug.Print "TopLevel caught: " & Err.Source & " -> " & Err.Description
    ' Err.Source will be "CallLevel1 <- TopLevel" (chained below)
End Sub

Public Sub CallLevel1()
    On Error GoTo handler
    CallLevel2
    Exit Sub
handler:
    ' Re-raise with chained source — preserves the call stack in Source.
    Err.Raise Err.Number, "CallLevel1 <- " & Err.Source, Err.Description
End Sub

Public Sub CallLevel2()
    On Error GoTo handler
    Dim x As Double
    x = 1 / 0
    Exit Sub
handler:
    Err.Raise Err.Number, "CallLevel2", Err.Description
End Sub

' VBA has no built-in stack trace — chaining Err.Source manually is the
' workaround. Production error logs become readable: "CallLevel2 <- CallLevel1 <- TopLevel".`,
    },
  ],

  // ─── §14 Concurrency ───────────────────────────────────────────────
  concurrency: [
    {
      lang: "vba",
      caption: "Application.OnTime — scheduled (asynchronous) execution",
      code: `Option Explicit

Private nextRun As Date
Private running As Boolean

Public Sub StartPolling()
    running = True
    ScheduleNext
End Sub

Public Sub StopPolling()
    running = False
    ' MUST cancel the scheduled run or it'll fire anyway.
    Application.OnTime nextRun, "PollOnce", , False
End Sub

Private Sub ScheduleNext()
    nextRun = Now + TimeValue("00:00:30")    ' 30 seconds
    Application.OnTime nextRun, "PollOnce"
End Sub

Public Sub PollOnce()
    ' This runs asynchronously — Excel returns control between fires.
    Debug.Print "polling at " & Now
    ' ... do work: refresh data, check files, etc.
    If running Then ScheduleNext              ' re-arm
End Sub

' Application.OnTime is the ONLY VBA-native async mechanism. The macro
' must be in a standard module (not a class) and the procedure name is
' a string. Cancel with Schedule:=False or it fires even after close.`,
    },
    {
      lang: "vba",
      caption: "DoEvents — cooperative yielding during long operations",
      code: `Option Explicit

Public Sub LongOperationWithProgress()
    Dim i As Long, n As Long: n = 1000000
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    For i = 1 To n
        ' ... expensive work ...
        If i Mod 10000 = 0 Then
            ' Update status bar + yield to keep UI responsive.
            Application.StatusBar = "Processing " & i & " / " & n
            DoEvents                    ' lets Excel repaint, handle clicks
        End If
    Next i

    Application.StatusBar = False
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
End Sub

' DoEvents yields control to the OS — Excel can repaint, process clicks,
' handle keystrokes. WITHOUT it, long macros look frozen ("Not Responding").
'
' CAUTION: DoEvents can RE-ENTER your macro if the user clicks a button
' that triggers it. Use a module-level "in_progress" flag to guard.`,
    },
    {
      lang: "vba",
      caption: "CreateThread via Windows API — actual multithreading (advanced)",
      code: `Option Explicit

' VBA is genuinely single-threaded. CreateThread CAN launch a real OS
' thread, but the VBA runtime is NOT thread-safe — most object model
' calls will crash. Use ONLY for pure-computation workloads (math, hashing)
' that touch no COM objects.

#If VBA7 Then
    Private Declare PtrSafe Function CreateThread Lib "kernel32" ( _
        ByVal sec As LongPtr, ByVal stack As LongPtr, _
        ByVal startAddr As LongPtr, ByVal param As LongPtr, _
        ByVal flags As Long, ByRef tid As LongPtr) As LongPtr
    Private Declare PtrSafe Function WaitForSingleObject Lib "kernel32" ( _
        ByVal h As LongPtr, ByVal ms As Long) As Long
    Private Declare PtrSafe Function CloseHandle Lib "kernel32" ( _
        ByVal h As LongPtr) As Long
#End If

' Realistically: don't do this. If you need real threads, move the work
' to a C# Excel-DNA add-in, a Python xlwings script, or a VB.NET COM
' add-in. VBA threads are a footgun — the runtime assumes single-threaded.

' The pragmatic alternatives for "background work":
'   1. Application.OnTime + DoEvents (cooperative, single-threaded)
'   2. Shell out to a separate process and poll for results
'   3. Move heavy compute to a Python/C# helper called via COM`,
    },
  ],

  // ─── §15 Testing ───────────────────────────────────────────────────
  testing: [
    {
      lang: "vba",
      caption: "Rubberduck — the modern unit testing framework",
      code: `' Requires Rubberduck VBE add-in: https://rubberduckvba.com/
' Tools > Rubberduck > Unit Tests > Add Test Module

Option Explicit

' @TestModule
' @Folder("Tests")

Private Assert As Object

' @ModuleInitialize
Public Sub ModuleInitialize()
    Set Assert = CreateObject("Rubberduck.AssertClass")
End Sub

' @TestMethod
Public Sub Factorial_OfFive_Returns120()
    Assert.AreEqual 120, Factorial(5)
End Sub

' @TestMethod
Public Sub Factorial_OfZero_ReturnsOne()
    Assert.AreEqual 1, Factorial(0)
End Sub

' @TestMethod
Public Sub Factorial_OfNegative_RaisesError()
    ' Rubberduck's Assert.ExpectError pairs with On Error GoTo
    On Error Resume Next
    Call Factorial(-1)
    Assert.AreEqual 5, Err.Number          ' Err 5 = "Invalid procedure call"
    On Error GoTo 0
End Sub

' @TestMethod
Public Sub SafeDivision_ByZero_ReturnsFalse()
    Dim r As Double
    Assert.IsFalse SafeDivision(10, 0, r)
End Sub

' Run via Rubberduck > Unit Tests > Run All. Results show in the Test
' Explorer window. Integration with the VBE = refactor + run in one place.`,
    },
    {
      lang: "vba",
      caption: "Debug.Assert — quick checks during development",
      code: `Option Explicit

Public Sub QuickChecks()
    ' Debug.Assert breaks into the debugger if the condition is False.
    ' No-op in production (compiled add-ins skip it) but invaluable
    ' during development.

    Dim xs(1 To 5) As Long, i As Long
    For i = 1 To 5
        xs(i) = i * 2
    Next i

    Debug.Assert SumArray(xs) = 30
    Debug.Assert UBound(xs) = 5
    Debug.Assert FindFirst(xs, 6) = 3

    ' Use the Immediate window:
    '   ? SumArray(xs)        ' prints the return value
    '   xs(1) = 99            ' mutate state, then re-run
End Sub

Public Function SumArray(xs() As Long) As Long
    Dim i As Long, s As Long
    For i = LBound(xs) To UBound(xs)
        s = s + xs(i)
    Next i
    SumArray = s
End Function

Public Function FindFirst(xs() As Long, ByVal target As Long) As Long
    Dim i As Long
    For i = LBound(xs) To UBound(xs)
        If xs(i) = target Then FindFirst = i: Exit Function
    Next i
    FindFirst = -1
End Function`,
    },
    {
      lang: "vba",
      caption: "Hand-rolled Assert module — no dependencies",
      code: `' Standard module: Assert (no Rubberduck required)
Option Explicit

Private failures As Long
Private tests As Long

Public Sub Reset()
    failures = 0
    tests = 0
End Sub

Public Sub AreEqual(ByVal expected As Variant, ByVal actual As Variant, Optional ByVal msg As String = "")
    tests = tests + 1
    If expected = actual Then
        Debug.Print "PASS: " & msg
    Else
        failures = failures + 1
        Debug.Print "FAIL: " & msg & " expected=" & expected & " actual=" & actual
    End If
End Sub

Public Sub IsTrue(ByVal cond As Boolean, Optional ByVal msg As String = "")
    tests = tests + 1
    If cond Then
        Debug.Print "PASS: " & msg
    Else
        failures = failures + 1
        Debug.Print "FAIL: " & msg & " (expected True)"
    End If
End Sub

Public Sub Report()
    Debug.Print "---"
    Debug.Print tests & " tests, " & failures & " failures"
    If failures > 0 Then Err.Raise vbObjectError + 999, , failures & " test(s) failed"
End Sub

' Usage:
'   Sub RunAllTests()
'       Assert.Reset
'       Assert.AreEqual 120, Factorial(5), "factorial 5"
'       Assert.AreEqual 1, Factorial(0), "factorial 0"
'       Assert.IsTrue SafeDivision(10, 2, 0), "10/2 ok"
'       Assert.Report
'   End Sub`,
    },
    {
      lang: "vba",
      caption: "Worksheet-based test runner — visible pass/fail",
      code: `Option Explicit

Public Sub RunTestsToSheet()
    ' Each test writes a row to a "Tests" worksheet for visible results.
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Tests")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = "Tests"
    End If
    ws.Cells.Clear
    ws.Range("A1:C1").Value = Array("Test", "Result", "Detail")
    ws.Range("A1:C1").Font.Bold = True

    Dim r As Long: r = 2
    r = RunOne(ws, r, "Factorial(5)=120", Factorial(5) = 120, "got " & Factorial(5))
    r = RunOne(ws, r, "Factorial(0)=1", Factorial(0) = 1, "")
    r = RunOne(ws, r, "BuildIN basic", BuildInClause("x", "a", "b") = "x IN ('a', 'b')", "")
    ws.Columns("A:C").AutoFit
End Sub

Private Function RunOne(ws As Worksheet, ByVal r As Long, ByVal name As String, _
                        ByVal passed As Boolean, ByVal detail As String) As Long
    ws.Cells(r, 1).Value = name
    ws.Cells(r, 2).Value = IIf(passed, "PASS", "FAIL")
    ws.Cells(r, 3).Value = detail
    If passed Then
        ws.Cells(r, 2).Interior.Color = RGB(200, 255, 200)
    Else
        ws.Cells(r, 2).Interior.Color = RGB(255, 200, 200)
    End If
    RunOne = r + 1
End Function

' Advantages: tests are auditable (a visible sheet), stakeholders can run
' them by clicking a button, results survive between sessions. Useful when
' Rubberduck isn't installed on the user's machine.`,
    },
  ],

  // ─── §16 Performance ───────────────────────────────────────────────
  performance: [
    { fact: "Cell-by-cell loops are 100-1000x slower than bulk .Value2. A 10k-row loop writing Cells(i,1).Value takes 30+ seconds; the same via 2D Variant takes 50ms.", tag: "perf" },
    { fact: "Application.ScreenUpdating = False gives 5-20x speedup on any macro that modifies the worksheet. Set it back to True in your cleanup block (always via On Error).", tag: "perf" },
    { fact: "Application.Calculation = xlCalculationManual during bulk writes prevents recalculation per cell. Restore to xlCalculationAutomatic in cleanup.", tag: "perf" },
    { fact: "Application.EnableEvents = False prevents Worksheet_Change events from firing during your macro — avoids cascade triggers. Restore in cleanup.", tag: "perf" },
    { fact: "Use Long, not Integer. Integer is 16-bit and gets promoted to Long on every arithmetic op on 32-bit+ CPUs — Integer is actually SLOWER than Long in VBA7.", tag: "gotcha" },
    { fact: "Early binding (Dim d As Scripting.Dictionary + Reference) is 2-5x faster than late binding (CreateObject) AND gives IntelliSense. Use early for development, switch to late for distribution if needed.", tag: "perf" },
    { fact: "Variant is 2-4x slower than typed variables — every access checks the subtype and converts. Always Dim with explicit types (Long, Double, String) for numerics.", tag: "perf" },
    { fact: ".Value2 is faster than .Value — .Value checks cell format and may apply currency/date conversion; .Value2 returns the raw underlying number. Use .Value2 unless you specifically need .Value's format handling.", tag: "perf" },
    { fact: "With blocks give a small perf win (cache the object reference) and improve readability. Use them for any sequence of 3+ operations on the same COM object.", tag: "perf" },
    { fact: "ReDim Preserve is O(n) — it allocates a new array, copies, and frees the old. Calling it in a loop is O(n^2). Preallocate to the max size, or use Collection/ArrayList.", tag: "complexity" },
    { fact: "Scripting.Dictionary.Exists is O(1); Collection.Item(key) is O(n) linear search. For any keyed lookup > 50 items, use Dictionary.", tag: "complexity" },
    { fact: "String concatenation in a loop (s = s & chunk) is O(n^2) — each concat allocates a new string. Build an array and Join at the end, or use StringBuilder via System.Text (late-bound COM).", tag: "complexity" },
    { fact: "Avoid Select and Activate — they trigger COM round-trips and events. Direct references (ws.Range(\"A1\").Value = 5) are 10-100x faster than Range(\"A1\").Select: ActiveCell.Value = 5.", tag: "perf" },
    { fact: "Application.StatusBar = \"...\" is the cheapest UI feedback — it doesn't trigger recalc or repaint. Pair with DoEvents every N iterations to keep the window responsive.", tag: "perf" },
    { fact: "Application.DisplayPageBreaks = False during bulk writes gives 2-3x speedup on large sheets — Excel recalculates page breaks on every change otherwise.", tag: "perf" },
    { fact: "Reading .Value2 once into a 2D Variant, mutating, and writing back is the #1 perf pattern. Each Range access is a COM call (~us); each cell is another. 100k cells = 100k round-trips in a naive loop.", tag: "perf" },
  ],

  // ─── §17 Ecosystem & Tooling ───────────────────────────────────────
  ecosystem: [
    { tool: "VBE (Visual Basic Editor)", purpose: "Built-in editor shipped with Office — Alt+F11 to open. No package manager; code lives inside the workbook or in exported .bas/.cls files.", url: "https://learn.microsoft.com/en-us/office/vba/library/reference/concepts/forms-instructions", category: "build" },
    { tool: "Rubberduck VBA", purpose: "Open-source VBE add-in: unit tests, refactoring (extract method, rename), code inspections, source-control export. The single biggest QoL upgrade.", url: "https://rubberduckvba.com/", category: "test" },
    { tool: "MZ-Tools", purpose: "Productivity add-in — code review, find/replace across projects, code libraries, error handlers, header templates.", url: "https://www.mztools.com/", category: "lint" },
    { tool: "VBA-Web", purpose: "HTTP client framework for VBA — request/response objects, JSON parsing, retries. Replaces WinHttp.WinHttpRequest boilerplate.", url: "https://github.com/VBA-tools/VBA-Web", category: "build" },
    { tool: "VBA-JSON", purpose: "JSON parser/serializer for VBA — handles nested objects/arrays. The de facto standard for JSON in Excel macros.", url: "https://github.com/VBA-tools/VBA-JSON", category: "build" },
    { tool: "xlwings", purpose: "Python alternative to VBA — call Python from Excel via add-in, full NumPy/Pandas ecosystem. Modern replacement for new projects.", url: "https://www.xlwings.org/", category: "build" },
    { tool: "Excel-DNA", purpose: "C# add-in framework — write Excel UDFs and macros in C#/.NET, with full modern tooling and NuGet. The path off VBA.", url: "https://excel-dna.net/", category: "build" },
    { tool: "Office Scripts (TypeScript)", purpose: "Microsoft's modern replacement for VBA in Excel for the web — TypeScript, version control, Power Automate integration. Web-only.", url: "https://learn.microsoft.com/en-us/office/dev/scripts/", category: "build" },
    { tool: "Microsoft Scripting Runtime", purpose: "COM library exposing FileSystemObject (file ops) and Dictionary (hash map). Add via Tools > References, or late-bind via CreateObject.", url: "https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/scripting-runtime", category: "build" },
    { tool: "Microsoft ActiveX Data Objects (ADO)", purpose: "Database access library — query SQL Server, Access, Oracle, Excel via OLE DB. Use 6.1 (latest).", url: "https://learn.microsoft.com/en-us/sql/ado/microsoft-activex-data-objects-ado", category: "build" },
    { tool: "Win32 API (Declare)", purpose: "Windows native functions via Declare — kernel32, user32, gdi32. Use PtrSafe + LongPtr for 64-bit compatibility. pinvoke.net is the reference.", url: "https://pinvoke.net/", category: "build" },
    { tool: "MSForms (UserForm)", purpose: "Built-in UI designer for dialogs — drag-and-drop controls, event handlers. Limited but sufficient for internal tools.", url: "https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/userform-object", category: "build" },
    { tool: "Code Cleaner", purpose: "VBE add-in that exports + reimports all modules — cleans up compile-state cruft and decompacts the file. Run periodically on large projects.", url: "https://www.appspro.com/Utilities/CodeCleaner.htm", category: "lint" },
    { tool: "Fiddler / Wireshark", purpose: "HTTP debugging — inspect WinHttp.WinHttpRequest calls from VBA. Fiddler is HTTP-specific; Wireshark is lower-level.", url: "https://www.telerik.com/fiddler", category: "debug" },
    { tool: "Immediate Window (Ctrl+G)", purpose: "Built-in REPL — evaluate expressions, run subs, inspect variables at breakpoints. The #1 VBA debugging tool.", url: "https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/immediate-window", category: "debug" },
  ],

  // ─── §18 Version History ───────────────────────────────────────────
  versionHistory: [
    { version: "VBA 1.0", year: 1993, highlight: "First released with Excel 5.0 — replaced Excel 4 macro language (XLM). Quickly ported to Word, Access, PowerPoint." },
    { version: "VBA 5.0", year: 1997, highlight: "Shipped with Office 97. Added class modules, multi-project support, the modern VBE. The 'modern' VBA baseline." },
    { version: "VBA 6.0", year: 1999, highlight: "Office 2000. Added StrConv, improved COM interop, more built-in functions. The version most enterprises still target for compatibility." },
    { version: "VBA 6.5", year: 2007, highlight: "Office 2007 — Ribbon UI introduced (VBA interacts via IRibbonUI). Stable language; bug fixes only from here on." },
    { version: "VBA 7.0", year: 2010, highlight: "Office 2010 — 64-bit support. Introduced LongPtr (auto Long/LongLong), PtrSafe keyword, #If VBA7 conditional. Major compat milestone." },
    { version: "VBA 7.1", year: 2013, highlight: "Office 2013. Bug fixes; new Application.OnUndo callback. Stable language." },
    { version: "Office 2016 / 2019 / 365", year: 2019, highlight: "VBA 7.1 maintained — no new language features. Bug fixes only; Microsoft adds new Excel features to the object model but not the language." },
    { version: "Office Scripts", year: 2020, highlight: "Microsoft introduces Office Scripts (TypeScript) for Excel on the web — the first modern alternative to VBA. New feature investment shifts here." },
    { version: "Excel Lambda", year: 2021, highlight: "Excel formulas become Turing-complete via LAMBDA — many VBA use cases (custom functions) can now be pure formulas." },
    { version: "Python in Excel", year: 2023, highlight: "Microsoft integrates Python directly into Excel (preview, then GA) — yet another alternative to VBA for data work." },
  ],

  // ─── §19 Interview Hot Questions ───────────────────────────────────
  interview: [
    { q: "Why use Long instead of Integer in VBA?", a: "Integer is 16-bit (-32768..32767), so it overflows for row counters past 32767 — Excel has 1,048,576 rows. Worse, on 32-bit+ CPUs every Integer operation gets promoted to Long internally and then truncated back, so Integer is actually slower than Long. Use Long for all integer work in modern VBA. LongLong (VBA7+ on 64-bit) is for very large values or Windows API handles — use LongPtr for handle compatibility.", difficulty: "easy" },
    { q: "What does Option Explicit do, and why is it mandatory?", a: "Option Explicit forces every variable to be declared with Dim/ReDim/Const before use. Without it, VBA silently creates a new Variant for any typo (so `totla = totla + 1` creates a new totla = Empty + 1 = 1, and your real total never updates). Put `Option Explicit` as the first line of EVERY module — there is no downside. Most senior devs also enable Tools > Options > Require Variable Declaration to auto-insert it.", difficulty: "easy" },
    { q: "What is the default parameter passing in VBA, and why does it matter?", a: "ByRef is the default — the caller's variable is mutable from inside the procedure. This causes spooky-action-at-a-distance bugs: a Sub that 'just reads' x can silently mutate the caller's copy. Mark args ByVal explicitly unless you genuinely want output parameters. A common gotcha: calling Foo (x) with parentheses forces a ByVal copy (it creates a temporary expression), while Foo x does not — same code, different semantics.", difficulty: "medium" },
    { q: "Why is On Error Resume Next dangerous, and how do you use it safely?", a: "On Error Resume Next disables ALL error reporting — every subsequent line that errors is silently skipped. A typo in `Range(\"Z100\").Value = x` does nothing and you spend hours debugging. Use it ONLY for one specific expected failure (e.g., checking if a key exists in a Collection), immediately followed by `If Err.Number <> 0 Then ...` and `On Error GoTo 0` to re-enable normal handling. Never leave Resume Next on across a whole procedure.", difficulty: "medium" },
    { q: "Explain the bulk .Value2 read/write pattern and why it's 100x faster.", a: "Each Range access is a COM cross-process call (~microseconds). A cell-by-cell loop makes N round-trips. The bulk pattern reads the entire range into a 2D 1-based Variant array with `data = rng.Value2` (one COM call), mutates the array in pure memory, then writes it back with `rng.Value2 = data` (one COM call). For 10k rows, that's 2 COM calls instead of 20k — typically 100-1000x faster. Also set ScreenUpdating = False, Calculation = Manual, EnableEvents = False for another 5-20x.", difficulty: "medium" },
    { q: "Compare early binding vs late binding for COM objects.", a: "Early binding: Tools > References > Microsoft Scripting Runtime, then `Dim d As Dictionary`. Gives IntelliSense, compile-time type checking, and is 2-5x faster (no IDispatch overhead). Late binding: `Dim d As Object: Set d = CreateObject(\"Scripting.Dictionary\")`. No reference needed, so the workbook works on machines without the reference checked. Best practice: develop with early binding for IntelliSense, switch to late binding before distribution. For Office's own objects (Range, Workbook), early binding is always fine — the reference is built in.", difficulty: "medium" },
    { q: "What is the difference between a Sub and a Function, and what about UDFs?", a: "A Sub performs an action and returns nothing — called via `Call SubName(args)` or `SubName args`. A Function returns a value and is called in expressions: `y = f(x)`. A User-Defined Function (UDF) is a Function placed in a standard module that Excel can call from a cell formula (=MyFunc(A1)). UDFs have strict rules: they cannot modify cells, run macros, format, or trigger events — they must be pure. For side effects (writing cells, formatting), use a Sub invoked from a button or shortcut.", difficulty: "easy" },
    { q: "Explain Variant coercion bugs and how to avoid them.", a: "Variant is a tagged union that silently converts between subtypes. `x = \"5\" + 3` returns 8 (string coerced to number) in some contexts and \"53\" (concat) in others — the result depends on Option Strict (which VBA doesn't have). `Empty + 5` returns 5; `Null` compared to anything returns Null, not True/False. Avoid by: always `Option Explicit`, declare explicit types (Long, Double, String), use `IsNumeric`/`IsNull`/`IsEmpty` to test before operating, and use `&` (not `+`) for string concatenation. Variants are necessary for .Value2 from ranges but should not leak into typed code.", difficulty: "hard" },
    { q: "How does VBA handle 32-bit vs 64-bit Office compatibility?", a: "VBA7 (Office 2010+) added 64-bit support via #If VBA7 conditional compilation, PtrSafe keyword on Declare statements, and LongPtr type (auto-expands to Long on 32-bit, LongLong on 64-bit). The codebase pattern: declare API functions twice in #If VBA7 ... #Else ... #End If blocks, use LongPtr for any handle/pointer parameter, and NEVER assume Long is 32 bits (it always is, but LongPtr is correct for handles). Without PtrSafe, Declare statements fail to compile on 64-bit Office — a common porting headache for legacy code.", difficulty: "hard" },
  ],

  // ─── §20 Comparisons ───────────────────────────────────────────────
  comparisons: [
    { vs: "Office Scripts (TypeScript)", whenThis: "Desktop-only automation, complex host events (Workbook_Open, Worksheet_Change), legacy macro maintenance, ribbon customization, UserForms.", whenThat: "Excel on the web, version-controlled scripts in OneDrive/SharePoint, Power Automate integration, cross-platform sharing." },
    { vs: "Python (xlwings)", whenThis: "Maintaining existing macro-enabled workbooks, no Python environment available, single-file deployment, simple Excel-only tasks.", whenThat: "Anything touching the broader ecosystem (NumPy, Pandas, requests, ML), large data processing, when you need real tooling (pip, pytest, git)." },
    { vs: "Excel-DNA (C#)", whenThis: "Quick automation in a workbook, simple data movement, when the team knows VBA and the deployment is internal.", whenThat: "Performance-critical UDFs (C# is 100x faster), need for NuGet packages, multi-threading, deployment as a single .xll add-in, modern .NET tooling." },
    { vs: "Power Query (M language)", whenThis: "Macros that touch multiple workbooks, run on events, format cells, build UIs.", whenThat: "ETL — reshape, clean, join, and load data into Excel. Power Query is declarative, cached, and dramatically faster for data reshaping than VBA loops." },
    { vs: "Excel formulas (LAMBDA + LET)", whenThis: "Macros that modify cells, run on events, interact with the host (Workbook, Ribbon), need imperative control flow.", whenThat: "Custom reusable functions, especially when the logic is pure math/data transformation. LAMBDA + LET make Excel formulas Turing-complete and avoid the deployment friction of VBA." },
  ],
};

export default sheet;
