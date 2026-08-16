// ─────────────────────────────────────────────────────────────────────────────
// Minimal, dependency-free syntax highlighter.
// Tokenizes by regex per-language, outputs React spans with stable class names
// that map to theme tokens (see globals.css → .cheat-code .tok-*).
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";

type Token = { type: string; value: string };

interface LangRule {
  comments: RegExp;
  strings: RegExp;
  numbers: RegExp;
  keywords: string[];
  builtins?: string[];
}

const LANG_RULES: Record<string, LangRule> = {
  python: {
    comments: /(#.*?$)/gm,
    strings: /(r?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["def","class","return","if","elif","else","for","while","in","not","and","or","is","None","True","False","import","from","as","with","try","except","finally","raise","yield","lambda","async","await","pass","break","continue","global","nonlocal","del","assert","match","case"],
    builtins: ["print","len","range","open","list","dict","set","tuple","str","int","float","bool","enumerate","zip","map","filter","sorted","sum","min","max","abs","type","isinstance","super","self"],
  },
  javascript: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","class","extends","super","this","typeof","instanceof","in","of","void","delete","try","catch","finally","throw","async","await","yield","import","export","from","default","null","undefined","true","false"],
    builtins: ["console","Math","Object","Array","String","Number","Boolean","Promise","JSON","Map","Set","Symbol","Reflect","Proxy"],
  },
  typescript: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["const","let","var","function","return","if","else","for","while","do","switch","case","break","continue","new","class","extends","implements","super","this","typeof","instanceof","in","of","void","delete","try","catch","finally","throw","async","await","yield","import","export","from","default","null","undefined","true","false","type","interface","enum","namespace","declare","abstract","readonly","public","private","protected","static","as","is","keyof","infer","never","unknown","any"],
    builtins: ["console","Math","Object","Array","String","Number","Boolean","Promise","JSON","Map","Set","Symbol","Record","Partial","Required","Readonly","Pick","Omit"],
  },
  rust: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*"|r#"(?:[^"]|#)*"#)/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F_]+|0[bB][01_]+|0o[0-7_]+)\b/g,
    keywords: ["fn","let","mut","const","static","struct","enum","trait","impl","pub","use","mod","crate","self","Self","super","as","in","ref","move","match","if","else","for","while","loop","break","continue","return","async","await","unsafe","extern","where","dyn","type","trait","true","false","Some","None","Ok","Err"],
    builtins: ["println!","print!","vec!","format!","String","Vec","Option","Result","Box","Rc","Arc","RefCell","HashMap","HashSet","BTreeMap"],
  },
  go: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*"|`[^`]*`)/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F_]+|0[bB][01_]+|0o[0-7_]+)\b/g,
    keywords: ["func","var","const","type","struct","interface","package","import","func","return","if","else","for","range","switch","case","default","break","continue","goto","defer","go","chan","select","map","nil","true","false"],
    builtins: ["fmt","make","len","cap","append","copy","delete","new","panic","recover","close","print","println","string","int","int64","float64","bool","byte","rune","error"],
  },
  cpp: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*"|R"([^(]*)\(([\s\S]*?)\)\2")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["int","char","bool","void","float","double","long","short","unsigned","signed","auto","const","static","constexpr","consteval","constinit","inline","volatile","register","class","struct","union","enum","namespace","using","template","typename","public","private","protected","virtual","override","final","abstract","new","delete","this","nullptr","true","false","if","else","for","while","do","switch","case","default","break","continue","return","goto","throw","try","catch","noexcept","operator","sizeof","alignof","decltype","auto","co_await","co_return","co_yield","concept","requires","consteval"],
    builtins: ["std","cout","cin","cerr","endl","vector","string","map","unordered_map","set","unordered_set","shared_ptr","unique_ptr","make_shared","make_unique","move","forward","pair","tuple","function","optional","variant"],
  },
  c: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["int","char","bool","void","float","double","long","short","unsigned","signed","const","static","inline","volatile","register","struct","union","enum","typedef","sizeof","alignof","auto","if","else","for","while","do","switch","case","default","break","continue","return","goto","NULL","true","false"],
    builtins: ["printf","scanf","malloc","calloc","realloc","free","memcpy","memset","strcpy","strlen","strcmp","fopen","fclose","fread","fwrite","fprintf","sprintf","snprintf","exit","atoi","atof"],
  },
  java: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDlL]?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["public","private","protected","static","final","abstract","class","interface","enum","record","extends","implements","import","package","new","this","super","instanceof","void","int","long","short","byte","char","boolean","float","double","if","else","for","while","do","switch","case","default","break","continue","return","throw","throws","try","catch","finally","synchronized","volatile","transient","native","strictfp","var","sealed","permits","yield","true","false","null"],
    builtins: ["System","String","Integer","Long","Double","Float","Boolean","Object","List","ArrayList","Map","HashMap","Set","HashSet","Optional","Stream","Math","Arrays","Collections","Objects","StringBuilder"],
  },
  csharp: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /(\$?"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDmMlL]?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["public","private","protected","internal","static","readonly","const","abstract","sealed","virtual","override","class","struct","interface","enum","record","delegate","event","namespace","using","new","this","base","is","as","typeof","sizeof","var","dynamic","void","int","long","short","byte","sbyte","char","bool","float","double","decimal","object","string","if","else","for","foreach","while","do","switch","case","default","break","continue","return","throw","try","catch","finally","yield","async","await","lock","fixed","unsafe","get","set","value","params","ref","out","in","true","false","null"],
    builtins: ["Console","String","Int32","Int64","Double","Boolean","Object","List","Dictionary","HashSet","Array","Enumerable","Task","Math","Convert","Guid","DateTime","TimeSpan","Nullable","Tuple"],
  },
  ruby: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|:(?:\w+|"(?:\\.|[^"\\])*"))/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["def","end","class","module","if","elsif","else","unless","while","until","for","in","do","break","next","redo","retry","return","yield","begin","rescue","ensure","raise","throw","catch","require","require_relative","include","extend","attr_accessor","attr_reader","attr_writer","public","private","protected","self","super","nil","true","false","lambda","proc","defined?","alias","undef","__FILE__","__LINE__","__ENCODING__"],
    builtins: ["puts","print","p","pp","require","require_relative","Integer","Float","String","Array","Hash","Symbol","Proc","Method","Object","Class","Module","Enumerable","Comparable","Kernel"],
  },
  php: {
    comments: /(\/\/.*?$|#.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|<<<(\w+)\s*\n[\s\S]*?\n\2)/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+|0[bB][01]+)\b/g,
    keywords: ["function","class","interface","trait","enum","extends","implements","abstract","final","public","private","protected","static","const","readonly","var","new","clone","instanceof","insteadof","namespace","use","as","if","else","elseif","endif","for","foreach","while","do","switch","case","default","break","continue","return","yield","try","catch","finally","throw","global","isset","unset","empty","list","array","print","echo","true","false","null","self","parent","this","fn","match","readonly","never","void","int","float","bool","string","array","object","callable","iterable","mixed"],
    builtins: ["echo","print","var_dump","print_r","sprintf","printf","count","strlen","array_map","array_filter","array_reduce","array_merge","array_keys","array_values","in_array","implode","explode","str_replace","preg_match","json_encode","json_decode","fopen","fclose","fread","fwrite"],
  },
  swift: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("(?:\\.|[^"\\])*"|"""[\s\S]*?""")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F_]+|0[bB][01_]+|0o[0-7_]+)\b/g,
    keywords: ["func","let","var","class","struct","enum","protocol","extension","init","deinit","self","Self","super","override","final","open","public","internal","private","fileprivate","static","lazy","weak","unowned","inout","in","as","is","where","for","in","while","repeat","if","else","guard","switch","case","default","break","continue","return","fallthrough","throw","throws","rethrows","try","catch","do","defer","async","await","actor","some","any","subscript","typealias","associatedtype","mutating","nonmutating","convenience","required","optional","nil","true","false"],
    builtins: ["print","Array","Dictionary","Set","String","Int","Double","Float","Bool","Optional","Result","Range","CountableRange","Map","Filter","Reduce","CompactMap","FlatMap","Sort","Sorted","Contains","Append","Count","First","Last","UUID","Date","Data","URL"],
  },
  kotlin: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFL]?|0[xX][0-9a-fA-F_]+|0[bB][01_]+)\b/g,
    keywords: ["fun","val","var","class","object","interface","enum","sealed","data","annotation","abstract","final","open","override","private","protected","internal","public","companion","init","constructor","this","super","return","if","else","when","for","while","do","break","continue","in","is","as","throw","try","catch","finally","import","package","operator","infix","inline","suspend","tailrec","vararg","reified","crossinline","noinline","by","lateinit","const","null","true","false","typealias","where","get","set","field","it"],
    builtins: ["println","print"," arrayOf","listOf","mutableListOf","setOf","mapOf","mutableMapOf","Pair","Triple","String","Int","Long","Short","Byte","Float","Double","Boolean","Char","List","Map","Set","Sequence","Collection","Iterable","Iterator","Range","Unit","Nothing","Any","Result"],
  },
  dart: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["var","final","const","late","void","int","double","num","bool","String","List","Map","Set","Future","Stream","class","enum","mixin","extension","abstract","interface","sealed","base","final","class","extends","implements","with","on","new","const","factory","this","super","return","if","else","for","while","do","switch","case","default","break","continue","in","is","as","try","catch","finally","throw","rethrow","async","await","yield","sync","typedef","import","export","library","part","deferred","as","show","hide","null","true","false","dynamic","Object","Never","Function","Record"],
    builtins: ["print","List","Map","Set","String","Duration","DateTime","Future","Stream","Timer","RegExp","Iterable","Iterator","Optional","Result","BigInt","num","Math","Random","Comparable","Hashable"],
  },
  r: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["function","if","else","for","while","repeat","break","next","return","in","TRUE","FALSE","NULL","NA","NaN","Inf","library","require","source","local","global","invisible"],
    builtins: ["c","list","vector","matrix","array","data.frame","factor","length","sum","mean","median","sd","var","min","max","range","which","which.min","which.max","apply","lapply","sapply","mapply","vapply","Map","Reduce","Filter","do.call","grep","gsub","strsplit","paste","paste0","sprintf","nchar","substr","read.csv","write.csv","plot","ggplot","lm","glm","summary","head","tail","str","names","colnames","rownames","table"],
  },
  sql: {
    comments: /(--.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /('(?:''|[^'])*')/g,
    numbers: /\b(\d+\.?\d*)\b/g,
    keywords: ["SELECT","FROM","WHERE","GROUP","BY","HAVING","ORDER","LIMIT","OFFSET","JOIN","INNER","LEFT","RIGHT","FULL","OUTER","ON","USING","UNION","ALL","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","INDEX","VIEW","DROP","ALTER","ADD","COLUMN","CONSTRAINT","PRIMARY","KEY","FOREIGN","REFERENCES","UNIQUE","NOT","NULL","DEFAULT","CHECK","AS","DISTINCT","CASE","WHEN","THEN","ELSE","END","EXISTS","IN","BETWEEN","LIKE","IS","AND","OR","NOT","ASC","DESC","WITH","RECURSIVE","WINDOW","OVER","PARTITION","ROWS","RANGE","UNBOUNDED","PRECEDING","FOLLOWING","CURRENT","ROW","GRANT","REVOKE","COMMIT","ROLLBACK","BEGIN","TRANSACTION","TRUNCATE","EXPLAIN","ANALYZE","VACUUM"],
    builtins: ["COUNT","SUM","AVG","MIN","MAX","COALESCE","NULLIF","CAST","CONVERT","EXTRACT","DATE_TRUNC","NOW","CURRENT_DATE","CURRENT_TIMESTAMP","ROW_NUMBER","RANK","DENSE_RANK","LAG","LEAD","FIRST_VALUE","LAST_VALUE","NTILE","STRING_AGG","ARRAY_AGG","JSON_AGG","GENERATE_SERIES"],
  },
  bash: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:[^'])*'|\$"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+)\b/g,
    keywords: ["if","then","else","elif","fi","case","esac","for","in","do","done","while","until","function","return","break","continue","exit","local","declare","export","unset","readonly","trap","set","shift","source","eval","exec","alias","unalias","true","false","test","select","time","coproc"],
    builtins: ["echo","printf","read","cd","pwd","ls","cp","mv","rm","mkdir","rmdir","ln","chmod","chown","chgrp","find","grep","sed","awk","sort","uniq","cut","tr","head","tail","wc","tee","xargs","which","whereis","locate","type","command","alias","jobs","bg","fg","kill","wait","disown","nohup","time","ulimit","umask"],
  },
  scala: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDlL]?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["def","val","var","lazy","class","object","trait","extends","with","type","abstract","final","sealed","case","override","private","protected","implicit","import","package","package","if","else","for","while","do","yield","match","case","return","throw","try","catch","finally","new","super","this","true","false","null","forSome","given","using","enum","then","end","extension","derives"],
    builtins: ["List","Map","Set","Seq","Vector","Array","Option","Some","None","Either","Left","Right","Try","Success","Failure","Future","Promise","Stream","Iterator","Range","String","Int","Long","Double","Float","Boolean","Char","Unit","Nothing","Any","AnyRef","AnyVal","Nothing","Null","Tuple","Pair"],
  },
  haskell: {
    comments: /(--.*?$|{-[\s\S]*?-})/gm,
    strings: /("(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
    keywords: ["module","where","import","qualified","as","hiding","data","type","newtype","class","instance","deriving","let","in","do","if","then","else","case","of","infix","infixl","infixr","type","family","default","forall","rec","proc"],
    builtins: ["putStrLn","putStr","print","read","show","readLn","getLine","map","filter","foldl","foldr","foldl'","zip","zipWith","concat","concatMap","length","null","head","tail","init","last","take","drop","splitAt","span","break","elem","notElem","lookup","zip","unzip","words","unwords","lines","unlines","Maybe","Just","Nothing","Either","Left","Right","IO","String","Int","Integer","Double","Float","Bool","Char"],
  },
  elixir: {
    comments: /(#.*?$)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'[^']*'|~[a-zA-Z]"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
    keywords: ["def","defp","defmodule","defprotocol","defimpl","defstruct","defmacro","defmacrop","defguard","defguardp","defoverridable","defcallback","defmodule","import","alias","require","use","do","end","if","else","unless","case","when","cond","fn","for","into","return","try","catch","rescue","after","raise","throw","with","receive","send","self","spawn","spawn_link","quote","unquote"],
    builtins: ["IO","Enum","Map","MapSet","List","String","Keyword","Range","Stream","Task","Agent","GenServer","Supervisor","Application","Kernel","Kernel.SpecialForms","inspect","puts","inspect","length","size","map_size","byte_size","tuple_size","is_nil","is_boolean","is_integer","is_float","is_binary","is_list","is_map","is_tuple","is_function","is_atom","hd","tl","elem","put_elem","append","prepend"],
  },
  clojure: {
    comments: /(;.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
    keywords: ["def","defn","defn-","defmacro","defmulti","defmethod","defprotocol","defrecord","deftype","defstruct","let","letfn","fn","if","when","cond","condp","case","do","when-let","if-let","loop","recur","for","doseq","while","try","catch","finally","throw","ns","require","import","use","refer",":require",":import",":use",":as",":refer","true","false","nil"],
    builtins: ["println","print","prn","pr","str","keyword","symbol","name","namespace","count","first","rest","next","nth","get","get-in","assoc","assoc-in","update","update-in","dissoc","merge","into","conj","cons","map","filter","remove","reduce","mapv","filterv","apply","partial","comp","complement","identity","constantly","inc","dec","+","-","*","/","=","<",">","<=",">=","and","or","not"],
  },
  lua: {
    comments: /(--\[\[[\s\S]*?\]\]|--.*?$)/gm,
    strings: /(\[\[[\s\S]*?\]\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["function","end","if","then","else","elseif","for","in","do","while","repeat","until","return","break","local","and","or","not","nil","true","false","goto"],
    builtins: ["print","type","tostring","tonumber","pairs","ipairs","next","select","assert","error","pcall","xpcall","require","dofile","loadfile","load","setmetatable","getmetatable","rawget","rawset","rawequal","rawlen","unpack","table","string","math","io","os","coroutine","package"],
  },
  julia: {
    comments: /(#.*?$)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?im?|0[xX][0-9a-fA-F]+|0b[01]+|0o[0-7]+)\b/g,
    keywords: ["function","end","if","elseif","else","for","in","while","break","continue","return","do","begin","let","const","global","local","struct","mutable","abstract","type","primitive","module","using","import","export","macro","quote","try","catch","finally","throw","struct","where","mutable","abstract","primitive","true","false","nothing","missing","NaN","Inf"],
    builtins: ["println","print","show","repr","string","parse","length","size","eltype","typeof","isa","convert","promote","zeros","ones","rand","randn","range","linspace","collect","enumerate","zip","map","filter","reduce","foldl","foldr","sum","prod","minimum","maximum","mean","std","var","sort","sorted","push!","pop!","append!","prepend!","get","get!","haskey","keys","values","pairs"],
  },
  matlab: {
    comments: /(%.*?$)/gm,
    strings: /('(?:''|[^'])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[ij]?)\b/g,
    keywords: ["function","end","if","elseif","else","for","while","break","continue","return","switch","case","otherwise","try","catch","classdef","methods","properties","events","enumeration","global","persistent","arguments","spmd","parfor","break","continue","return"],
    builtins: ["disp","fprintf","sprintf","length","size","numel","ndims","zeros","ones","eye","rand","randn","linspace","logspace","meshgrid","find","any","all","sum","prod","cumsum","cumprod","mean","median","std","var","min","max","sort","sortrows","unique","reshape","repmat","permute","ipermute","squeeze","cat","horzcat","vertcat","plot","scatter","histogram","bar","imagesc","contour","surf","mesh","figure","subplot","axes","xlim","ylim","title","xlabel","ylabel","legend","hold"],
  },
  perl: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|q\{[^}]*\}|qq\{[^}]*\})/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["sub","my","our","local","use","no","require","package","BEGIN","END","if","unless","while","until","for","foreach","do","last","next","redo","return","goto","and","or","not","eq","ne","lt","gt","le","ge","cmp","x","q","qq","qw","qr","m","s","tr","y","print","printf","sprintf","say","die","warn","eval","wantarray","ref","bless","tie","untie","defined","undef","exists","delete","scalar","wantarray","chomp","chop","chdir","chomp","chop"],
    builtins: ["print","say","printf","sprintf","length","scalar","defined","undef","exists","delete","keys","values","each","push","pop","shift","unshift","splice","reverse","sort","map","grep","split","join","substr","index","rindex","chomp","chop","chdir","chmod","chown","die","warn","eval","ref","bless","tie","untie","open","close","read","write","seek","tell","print","eof"],
  },
  "objective-c": {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /(@"(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["@interface","@implementation","@end","@class","@protocol","@property","@synthesize","@dynamic","@selector","@encode","@try","@catch","@finally","@throw","@autoreleasepool","@synchronized","@public","@private","@protected","@package","@required","@optional","@compatibility_alias","int","char","BOOL","void","float","double","long","short","unsigned","signed","const","static","extern","volatile","auto","register","id","Class","SEL","IMP","instancetype","YES","NO","nil","Nil","self","super","if","else","for","while","do","switch","case","default","break","continue","return","goto","sizeof","typedef","struct","union","enum"],
    builtins: ["NSObject","NSString","NSArray","NSMutableArray","NSDictionary","NSMutableDictionary","NSSet","NSMutableSet","NSNumber","NSData","NSDate","NSError","NSException","NSURL","NSNotification","NSNotificationCenter","NSLog","NSString","YES","NO","nil","Nil","id","self","super","instancetype","dispatch_async","dispatch_sync","dispatch_get_main_queue","dispatch_get_global_queue"],
  },
  fortran: {
    comments: /(!.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:[^'])*')/g,
    numbers: /\b(\d+\.?\d*(?:[eEdD][+-]?\d+)?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["program","end","subroutine","function","module","use","implicit","none","integer","real","complex","logical","character","dimension","intent","in","out","inout","parameter","allocatable","pointer","target","save","do","if","then","else","elseif","endif","select","case","while","where","forall","cycle","exit","return","call","contains","interface","operator","assignment","procedure","type","class","extends","abstract","public","private","protected","result","recursive","pure","elemental","parallel","do","enddo","end"],
    builtins: ["print","write","read","open","close","inquire","format","allocate","deallocate","size","shape","lbound","ubound","merge","pack","unpack","reshape","spread","cshift","eoshift","transpose","matmul","dot_product","sum","product","maxval","minval","count","any","all","sin","cos","tan","asin","acos","atan","atan2","exp","log","sqrt","abs","mod","floor","ceiling","nint","min","max"],
  },
  vba: {
    comments: /('.*?$|REM .*?$)/gm,
    strings: /("(?:[^"])*")/g,
    numbers: /\b(\d+\.?\d*)\b/g,
    keywords: ["Sub","End","Function","Dim","Const","Static","Public","Private","Friend","Property","Get","Let","Set","Type","Enum","If","Then","Else","ElseIf","End","If","Select","Case","For","Each","To","Step","Next","Do","Loop","While","Until","Wend","With","Exit","Call","Optional","ByVal","ByRef","ParamArray","Type","As","Integer","Long","Single","Double","Currency","String","Boolean","Date","Variant","Object","Byte","True","False","Nothing","Null","Empty","Error","On","Resume","GoTo","GoSub","Return","Stop","End","Declare","Lib","Alias","Implements","Class","Module","Option","Explicit","Base","Compare","Private","Module"],
    builtins: ["MsgBox","InputBox","Print","Debug","Range","Cells","Worksheets","Sheets","Workbooks","Application","ActiveCell","Selection","ActiveWorkbook","ActiveSheet","ThisWorkbook","CreateObject","GetObject","Array","IsArray","LBound","UBound","Erase","ReDim","Preserve","Split","Join","Replace","InStr","InStrRev","Left","Right","Mid","Len","Trim","LTrim","RTrim","UCase","LCase","StrConv","Format","CInt","CLng","CDbl","CSng","CStr","CBool","CDate","CVDate","IsNumeric","IsDate","IsNull","IsEmpty","IsObject","IsArray","VarType","TypeName"],
  },
  assembly: {
    comments: /(;.*?$)/gm,
    strings: /("(?:[^"])*"|'(?:[^'])*')/g,
    numbers: /\b(0[xX][0-9a-fA-F]+|\d+|[0-9a-fA-F]+H|[01]+B)\b/g,
    keywords: ["mov","push","pop","lea","add","sub","mul","div","imul","idiv","inc","dec","neg","cmp","test","jmp","je","jne","jz","jnz","jg","jge","jl","jle","ja","jae","jb","jbe","call","ret","int","iret","nop","and","or","xor","not","shl","shr","sar","sal","ror","rol","movzx","movsx","cmpxchg","xchg","lock","rep","repe","repne","movs","stos","lods","scas","cmps","ins","outs","in","out","hlt","wait","cli","sti","cld","std","clc","stc","cmc","pushf","popf","sahf","lahf","enter","leave","bound","arpl","lsl","ltr","str","lidt","sidt","lgdt","sgdt","smsw","lmsw"],
    builtins: ["rax","rbx","rcx","rdx","rsi","rdi","rbp","rsp","r8","r9","r10","r11","r12","r13","r14","r15","eax","ebx","ecx","edx","esi","edi","ebp","esp","ax","bx","cx","dx","si","di","bp","sp","ah","al","bh","bl","ch","cl","dh","dl","cs","ds","es","fs","gs","ss","rip","eip","ip","rflags","eflags","flags"],
  },
  yaml: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:[^'])*')/g,
    numbers: /\b(\d+\.?\d*)\b/g,
    keywords: ["true","false","null","yes","no","on","off"],
    builtins: [],
  },
  dockerfile: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:[^'])*')/g,
    numbers: /\b(\d+)\b/g,
    keywords: ["FROM","RUN","CMD","LABEL","MAINTAINER","EXPOSE","ENV","ADD","COPY","ENTRYPOINT","VOLUME","USER","WORKDIR","ARG","ONBUILD","STOPSIGNAL","HEALTHCHECK","SHELL","AS","--platform","--mount"],
    builtins: [],
  },
  groovy: {
    comments: /(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm,
    strings: /("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/[^\/\n]+\/[gimsx]*)/g,
    numbers: /\b(\d+\.?\d*(?:[eE][+-]?\d+)?[fFdDgGlLbB]?|0[xX][0-9a-fA-F]+)\b/g,
    keywords: ["def","as","in","abstract","assert","break","case","catch","class","const","continue","def","default","do","else","enum","extends","false","finally","for","goto","if","implements","import","instanceof","interface","native","new","null","package","return","static","strictfp","super","switch","synchronized","this","throw","throws","trait","transient","true","try","volatile","while","it"],
    builtins: ["println","print","printf","sprintf","assert","each","collect","find","findAll","grep","any","every","sum","min","max","size","split","join","trim","toUpperCase","toLowerCase","toList","tokenize","String","Integer","Long","Double","List","Map","Set","Range","Closure","GroovyClassLoader","GroovyShell"],
  },
  shell: {
    comments: /(#.*?$)/gm,
    strings: /("(?:\\.|[^"\\])*"|'(?:[^'])*'|\$"(?:\\.|[^"\\])*")/g,
    numbers: /\b(\d+)\b/g,
    keywords: ["if","then","else","elif","fi","case","esac","for","in","do","done","while","until","function","return","break","continue","exit","local","declare","export","unset","readonly","trap","set","shift","source","eval","exec","alias","unalias","true","false","test","select","time"],
    builtins: ["echo","printf","read","cd","pwd","ls","cp","mv","rm","mkdir","rmdir","ln","chmod","chown","find","grep","sed","awk","sort","uniq","cut","tr","head","tail","wc","tee","xargs","which","type","command","jobs","bg","fg","kill","wait","nohup","time","ulimit","umask"],
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Tokenize and render a code block. Returns an array of React spans with
 * stable class names (.tok-kw / .tok-str / .tok-com / .tok-num / .tok-fn /
 * .tok-punc) that map to the current theme tokens via globals.css.
 */
export function highlight(code: string, lang?: string): React.ReactNode {
  if (!lang || !LANG_RULES[lang]) {
    return <span>{code}</span>;
  }
  const rule = LANG_RULES[lang];
  const tokens: Token[] = [];
  // We use a sweep approach: collect all matches from all categories, sort by
  // position, then emit gaps as plain text.
  type Match = { start: number; end: number; type: string; value: string };
  const matches: Match[] = [];

  const collect = (re: RegExp, type: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      matches.push({ start: m.index, end: m.index + m[0].length, type, value: m[0] });
    }
  };

  collect(rule.comments, "com");
  collect(rule.strings, "str");
  collect(rule.numbers, "num");

  // Keywords and builtins: word-boundary sweep
  const wordRe = /\b([A-Za-z_][A-Za-z0-9_!]*)\b/g;
  let wm: RegExpExecArray | null;
  while ((wm = wordRe.exec(code)) !== null) {
    const word = wm[1];
    if (rule.keywords.includes(word)) {
      matches.push({ start: wm.index, end: wm.index + word.length, type: "kw", value: word });
    } else if (rule.builtins?.includes(word)) {
      matches.push({ start: wm.index, end: wm.index + word.length, type: "fn", value: word });
    }
  }

  // Sort by start position; drop overlaps (earliest wins, then longest)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start < lastEnd) continue;
    filtered.push(m);
    lastEnd = m.end;
  }

  // Emit tokens + plain-text gaps
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];
    if (m.start > cursor) {
      out.push(<span key={`t-${i}`}>{code.slice(cursor, m.start)}</span>);
    }
    out.push(
      <span key={`m-${i}`} className={`tok-${m.type}`}>
        {m.value}
      </span>,
    );
    cursor = m.end;
  }
  if (cursor < code.length) {
    out.push(<span key="tail">{code.slice(cursor)}</span>);
  }
  return <>{out}</>;
}
