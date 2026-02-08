import { CategoryDefinition } from "./analyzers/types";

export const categories: CategoryDefinition[] = [
  {
    id: 1,
    name: "Consistent Patterns",
    subIssues: [
      { id: "1.1", categoryId: 1, name: "Structural consistency across similar files", description: "Files of the same type follow the same structure", analysisType: "llm" },
      { id: "1.2", categoryId: 1, name: "Consistent error handling", description: "Error handling follows a single pattern", analysisType: "llm" },
      { id: "1.3", categoryId: 1, name: "Naming convention consistency", description: "Casing variance across files", analysisType: "static" },
      { id: "1.4", categoryId: 1, name: "Consistent API patterns", description: "Endpoints validate/authenticate/respond consistently", analysisType: "llm" },
      { id: "1.5", categoryId: 1, name: "Test pattern consistency", description: "Setup/assertion style variance", analysisType: "static" },
    ],
  },
  {
    id: 2,
    name: "Explicit Over Implicit",
    subIssues: [
      { id: "2.1", categoryId: 2, name: "Metaprogramming avoidance", description: "eval, Function constructor, Proxy usage", analysisType: "static" },
      { id: "2.2", categoryId: 2, name: "Decorator count", description: "Number of decorators used", analysisType: "static" },
      { id: "2.3", categoryId: 2, name: "Implicit dependency injection", description: "DI containers that wire by convention", analysisType: "llm" },
      { id: "2.4", categoryId: 2, name: "Convention-based routing", description: "Auto-discovery of handlers by file name", analysisType: "llm" },
      { id: "2.5", categoryId: 2, name: "Prototype mutation", description: ".prototype. assignments", analysisType: "static" },
      { id: "2.6", categoryId: 2, name: "Dynamic property access", description: "obj[computed] count", analysisType: "static" },
    ],
  },
  {
    id: 3,
    name: "Strong Typing",
    subIssues: [
      { id: "3.1", categoryId: 3, name: "any type usage", description: "Count of any per file", analysisType: "static" },
      { id: "3.2", categoryId: 3, name: "Untyped function signatures", description: "Untyped parameters and return values", analysisType: "static" },
      { id: "3.4", categoryId: 3, name: "Domain entity types", description: "Explicit types for core domain entities", analysisType: "llm" },
      { id: "3.5", categoryId: 3, name: "Type assertions", description: "as and ! non-null assertions", analysisType: "static" },
      { id: "3.6", categoryId: 3, name: "Typed config objects", description: "Config and options objects are typed", analysisType: "llm" },
    ],
  },
  {
    id: 4,
    name: "Predictable File Structure",
    subIssues: [
      { id: "4.1", categoryId: 4, name: "Domain organization", description: "Files grouped by domain vs technical layer", analysisType: "llm" },
      { id: "4.2", categoryId: 4, name: "File naming conventions", description: "Consistent naming patterns", analysisType: "llm" },
      { id: "4.3", categoryId: 4, name: "Test colocation", description: "Distance between source and test", analysisType: "static" },
      { id: "4.4", categoryId: 4, name: "File length", description: "Line count per file", analysisType: "static" },
      { id: "4.5", categoryId: 4, name: "Directory nesting depth", description: "How deeply nested files are", analysisType: "static" },
      { id: "4.6", categoryId: 4, name: "Exports per file", description: "Number of exports per file", analysisType: "static" },
    ],
  },
  {
    id: 5,
    name: "Small Focused Units",
    subIssues: [
      { id: "5.1", categoryId: 5, name: "Function length", description: "Line count per function", analysisType: "static" },
      { id: "5.2", categoryId: 5, name: "Parameter count", description: "Number of parameters per function", analysisType: "static" },
      { id: "5.3", categoryId: 5, name: "Boolean parameters", description: "Functions with boolean params", analysisType: "static" },
      { id: "5.4", categoryId: 5, name: "Single responsibility", description: "Functions doing one thing", analysisType: "llm" },
      { id: "5.5", categoryId: 5, name: "Module focus", description: "Modules with narrow purpose", analysisType: "llm" },
      { id: "5.6", categoryId: 5, name: "Nesting depth", description: "if/for/while nesting depth", analysisType: "static" },
    ],
  },
  {
    id: 6,
    name: "Clean Signal-to-Noise",
    subIssues: [
      { id: "6.1", categoryId: 6, name: "Dead exports", description: "Exported but never imported", analysisType: "static" },
      { id: "6.2", categoryId: 6, name: "Commented-out code", description: "Regex detection of commented code", analysisType: "static" },
      { id: "6.3", categoryId: 6, name: "Unnecessary duplication", description: "Duplicated logic across files", analysisType: "llm" },
      { id: "6.4", categoryId: 6, name: "Stale TODOs", description: "TODO/FIXME/HACK count", analysisType: "static" },
      { id: "6.5", categoryId: 6, name: "Boilerplate ratio", description: "Repetitive scaffolding code", analysisType: "llm" },
      { id: "6.6", categoryId: 6, name: "Unnecessary abstraction", description: "Empty pass-through layers", analysisType: "llm" },
      { id: "6.7", categoryId: 6, name: "Config minimality", description: "Excessive config options and feature flags", analysisType: "llm" },
    ],
  },
  {
    id: 7,
    name: "Good Naming",
    subIssues: [
      { id: "7.1", categoryId: 7, name: "Descriptive names", description: "Names that communicate intent", analysisType: "llm" },
      { id: "7.2", categoryId: 7, name: "Name uniqueness", description: "How many files a name appears in", analysisType: "static" },
      { id: "7.3", categoryId: 7, name: "Boolean variable prefixes", description: "is/has/should/can prefixes", analysisType: "static" },
      { id: "7.4", categoryId: 7, name: "Function verb prefixes", description: "get/set/create/delete/validate etc.", analysisType: "static" },
      { id: "7.5", categoryId: 7, name: "Short identifiers", description: "Abbreviation ratio", analysisType: "static" },
      { id: "7.6", categoryId: 7, name: "Consistent domain language", description: "Same concept named consistently", analysisType: "llm" },
    ],
  },
  {
    id: 8,
    name: "Architectural Documentation",
    subIssues: [
      { id: "8.1", categoryId: 8, name: "README/CLAUDE.md existence", description: "Existence and length of docs", analysisType: "static" },
      { id: "8.2", categoryId: 8, name: "Documented conventions", description: "Conventions explained in docs", analysisType: "llm" },
      { id: "8.3", categoryId: 8, name: "Documented business rules", description: "Business rules written down", analysisType: "llm" },
      { id: "8.4", categoryId: 8, name: "Documented data flow", description: "Data flow explained", analysisType: "llm" },
      { id: "8.5", categoryId: 8, name: "Migration context", description: "Deprecations and migrations documented", analysisType: "llm" },
      { id: "8.6", categoryId: 8, name: "Docs close to code", description: "Documentation in repo vs external", analysisType: "llm" },
    ],
  },
  {
    id: 9,
    name: "Tests",
    subIssues: [
      { id: "9.1", categoryId: 9, name: "Tests as documentation", description: "Tests show expected behavior", analysisType: "llm" },
      { id: "9.2", categoryId: 9, name: "Test file existence ratio", description: "Source files with corresponding tests", analysisType: "static" },
      { id: "9.3", categoryId: 9, name: "Test determinism", description: "Tests are deterministic", analysisType: "llm" },
      { id: "9.4", categoryId: 9, name: "Test isolation", description: "Tests don't depend on shared state", analysisType: "llm" },
      { id: "9.5", categoryId: 9, name: "Test description quality", description: "Length of it()/describe() strings", analysisType: "static" },
      { id: "9.6", categoryId: 9, name: "Fixture simplicity", description: "Simple vs complex fixtures", analysisType: "llm" },
      { id: "9.7", categoryId: 9, name: "Edge case coverage", description: "Tests cover edge cases", analysisType: "llm" },
    ],
  },
  {
    id: 10,
    name: "Shallow Dependencies",
    subIssues: [
      { id: "10.1", categoryId: 10, name: "Inheritance depth", description: "Class extends chain length", analysisType: "static" },
      { id: "10.3", categoryId: 10, name: "Circular dependencies", description: "Import graph cycles", analysisType: "static" },
      { id: "10.4", categoryId: 10, name: "Barrel file count", description: "Re-export / barrel files", analysisType: "static" },
      { id: "10.5", categoryId: 10, name: "Cross-module side effects", description: "Importing causes side effects", analysisType: "llm" },
      { id: "10.6", categoryId: 10, name: "Max import depth", description: "Import hops to reach leaf", analysisType: "static" },
      { id: "10.7", categoryId: 10, name: "Files per feature", description: "Imports from a single entry point", analysisType: "static" },
    ],
  },
];

// Thresholds for static analysis scoring
export const thresholds = {
  fileLength: { good: 300, acceptable: 500, bad: 800 },
  functionLength: { good: 30, acceptable: 50, bad: 100 },
  paramCount: { good: 3, acceptable: 5, bad: 8 },
  nestingDepth: { good: 2, acceptable: 3, bad: 5 },
  exportsPerFile: { good: 5, acceptable: 10, bad: 20 },
  directoryDepth: { good: 4, acceptable: 6, bad: 8 },
  anyPerFile: { good: 0, acceptable: 2, bad: 5 },
  typeAssertionsPerFile: { good: 1, acceptable: 3, bad: 8 },
  todoCount: { good: 5, acceptable: 20, bad: 50 },
  identifierMinLength: 3,
  booleanPrefixes: ["is", "has", "should", "can", "will", "did", "was", "does"],
  functionVerbPrefixes: ["get", "set", "create", "delete", "remove", "update", "validate", "check", "find", "fetch", "send", "handle", "process", "build", "make", "parse", "format", "convert", "calculate", "compute", "init", "load", "save", "render", "resolve", "run", "execute", "is", "has", "should", "can", "will", "does", "did", "was", "as", "to", "from", "into", "analyze", "apply", "use", "do", "on", "emit", "dispatch", "register", "ensure", "assert", "test", "describe", "throw", "return", "map", "reduce", "filter", "sort", "merge", "split", "join", "match", "replace", "add", "insert", "push", "pop", "append", "prepend", "wrap", "unwrap", "encode", "decode", "serialize", "deserialize", "transform", "normalize", "sanitize", "extract", "inject", "start", "stop", "open", "close", "read", "write", "log", "warn", "print", "show", "hide", "enable", "disable", "toggle", "trigger", "fire", "notify", "subscribe", "unsubscribe", "listen", "watch", "observe", "mount", "unmount", "attach", "detach", "connect", "disconnect", "bind", "unbind", "lock", "unlock", "reset", "clear", "flush", "drain", "poll", "retry", "abort", "cancel", "skip", "ignore", "allow", "deny", "accept", "reject", "approve", "revoke", "grant", "verify", "confirm", "authenticate", "authorize", "sign", "encrypt", "decrypt", "hash", "compare", "diff", "patch", "clone", "copy", "move", "rename", "exists", "contain", "include", "exclude", "require", "import", "export", "provide", "consume", "produce", "publish", "broadcast", "schedule", "queue", "enqueue", "dequeue", "cache", "invalidate", "refresh", "sync", "async", "await", "delay", "debounce", "throttle", "limit", "paginate", "scroll", "navigate", "redirect", "route", "forward", "proxy", "delegate", "override", "extend", "implement", "inherit", "compose", "pipe", "chain", "backfill", "migrate", "seed", "populate", "index", "reindex", "archive", "restore", "cleanup", "purge", "prune", "trim", "truncate", "pad", "fill", "generate", "derive", "interpolate", "evaluate", "measure", "benchmark", "profile", "trace", "debug", "inspect", "dump", "visit", "traverse", "walk", "iterate", "loop", "recurse", "yield", "collect", "gather", "aggregate", "accumulate", "count", "sum", "average", "group", "partition", "chunk", "batch", "flatten", "nest", "unnest", "pick", "omit", "select", "deselect", "focus", "blur", "click", "hover", "drag", "drop", "swap", "reorder", "shuffle", "sample", "assign", "allocate", "release", "acquire", "dispose", "destroy", "tear", "upsert", "categorize", "classify", "try", "complete", "finalize", "prepare", "setup", "configure", "install", "uninstall", "bootstrap", "scaffold", "stub", "mock", "spy", "fake", "simulate", "replay", "undo", "redo", "revert", "rollback", "commit", "stage", "unstage", "stash", "apply", "augment", "decorate", "annotate", "tag", "label", "mark", "unmark", "flag", "unflag", "pin", "unpin", "bookmark", "archive", "unarchive", "mute", "unmute", "block", "unblock", "ban", "suspend", "activate", "deactivate", "compile", "transpile", "minify", "bundle", "lint", "typecheck", "validate", "test", "benchmark", "deploy", "undeploy", "provision", "deprovision", "scale", "warm", "cool", "preload", "prefetch", "precompute", "prerender", "hydrate", "dehydrate", "marshal", "unmarshal", "stringify", "tokenize", "lex", "infer", "coerce", "cast", "assert", "satisfy", "fulfill", "void", "noop", "stub", "intercept", "retry", "wait", "sleep", "tick", "step", "advance", "rewind", "seek", "scrub", "clamp", "constrain", "bound", "cap", "floor", "ceil", "round", "raise", "lower", "increment", "decrement", "multiply", "divide", "negate", "invert", "complement", "rotate", "translate", "scale", "skew", "project", "unproject"],
  functionVerbExclusions: new Set(["main", "describe", "it", "test", "before", "after", "beforeEach", "afterEach", "beforeAll", "afterAll"]),
  commonAbbreviations: new Set(["id", "url", "api", "db", "io", "ui", "ok", "ip", "os", "fs", "js", "ts", "css", "html", "http", "https", "json", "xml", "sql", "jwt", "env", "config", "src", "dist", "lib", "pkg", "cmd", "arg", "args", "fn", "cb", "err", "req", "res", "ctx", "msg", "ref", "idx", "len", "max", "min", "num", "str", "obj", "arr", "val", "tmp", "dev", "prod"]),
};

export function getAllSubIssues(): { id: string; categoryId: number; name: string; analysisType: "static" | "llm" }[] {
  return categories.flatMap((cat) =>
    cat.subIssues.map((si) => ({ id: si.id, categoryId: cat.id, name: si.name, analysisType: si.analysisType }))
  );
}

export function getStaticSubIssues() {
  return getAllSubIssues().filter((si) => si.analysisType === "static");
}

export function getLlmSubIssues() {
  return getAllSubIssues().filter((si) => si.analysisType === "llm");
}
