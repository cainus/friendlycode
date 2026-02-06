# Top 10 Codebase Factors That Affect LLM Effectiveness — Detailed Breakdown

## 1. Consistent Patterns

### 1.1 Structural Consistency Across Similar Files
When all files of the same type (endpoints, models, tests) follow the same structure — same import order, same export pattern, same internal organization — the LLM learns one template and applies it everywhere. When every file is structured differently, every file is a fresh problem.

### 1.2 Consistent Error Handling
When error handling follows a single pattern (e.g., always throw typed errors, always return Result types, always use a shared error middleware), the LLM knows how to handle errors in new code. Mixed approaches (sometimes throw, sometimes return null, sometimes callback with error) force the LLM to check every call site.

### 1.3 Consistent Naming Conventions
When all database fields are camelCase, all files use the same casing convention, all boolean variables use `is`/`has`/`should` prefixes — the LLM can predict names before searching. Inconsistent conventions mean more searching and more guessing.

### 1.4 Consistent API Patterns
When every endpoint validates input the same way, authenticates the same way, and returns responses in the same shape, the LLM can write a new endpoint by pattern-matching against any existing one. Divergent patterns per endpoint mean reading each one individually.

### 1.5 Consistent Test Patterns
When all tests use the same setup/teardown approach, the same assertion style, and the same fixture patterns, the LLM can write tests by example. Mixed test styles (some use mocks, some use integration fixtures, some use different assertion libraries) require understanding each test file's specific approach.

## 2. Explicit Over Implicit

### 2.1 Avoid Metaprogramming and Code Generation
Dynamically generated methods, runtime class creation, and eval-based patterns are invisible to static analysis. The LLM can only reason about code that exists in source files. If a method is generated at runtime, the LLM can't find it, understand it, or modify it.

### 2.2 Avoid Decorator-Heavy Patterns
Decorators hide behavior behind annotations. `@Cached @Logged @Authenticated` on a method means three layers of behavior that the LLM has to trace through separate files to understand. Explicit middleware or wrapper calls are more verbose but vastly easier to follow.

### 2.3 Avoid Implicit Dependency Injection
DI containers that wire dependencies by convention or configuration files mean the LLM can't tell what a class depends on by reading its source file. Explicit constructor parameters or imports make dependencies visible at the point of use.

### 2.4 Avoid Convention-Based Routing and Registration
Frameworks that auto-discover handlers by file name or directory structure (e.g., file-based routing, auto-registration by naming convention) make it hard for the LLM to trace which code handles which request. Explicit route registration is greppable.

### 2.5 Avoid Monkey-Patching and Prototype Mutation
Modifying objects or prototypes at runtime changes behavior in ways that are invisible when reading the affected code. The LLM reads a function, sees one thing, but the function does something else because its dependencies were patched elsewhere.

### 2.6 Avoid Magic Strings and Dynamic Property Access
`obj[computedKey]` and `emitter.emit("someEvent")` are hard to trace. The LLM can grep for a function name but can't grep for a dynamically constructed string. Prefer explicit, static references wherever possible.

## 3. Strong Typing and Defined Contracts

### 3.1 Minimize Use of `any`
Every `any` type is a hole in the LLM's understanding. It can't infer what data looks like, what operations are valid, or what downstream code expects. Explicit types at module boundaries are especially important.

### 3.2 Type Function Parameters and Return Values
Typed signatures let the LLM understand a function without reading its body. `function getUser(id: string): Promise<User | null>` communicates intent immediately. An untyped version forces the LLM to trace the implementation.

### 3.3 Use Schema Validation Libraries (Zod, etc.)
Runtime validation schemas serve double duty — they validate data and they document its shape. The LLM can read a Zod schema and understand exactly what an API endpoint accepts, without tracing through handler code.

### 3.4 Define Explicit Types for Domain Entities
Shared type definitions for core entities (User, Class, School) act as a single source of truth. When these are well-defined, the LLM knows the shape of data everywhere it's used. When entities are ad-hoc or inconsistently typed, the LLM has to infer shapes from usage.

### 3.5 Avoid Type Assertions and Casts
`as any`, `as unknown as SomeType`, and `!` non-null assertions all undermine the type system. They tell the LLM "trust me" without providing information. The LLM then has no way to verify correctness.

### 3.6 Type Configuration and Options Objects
Untyped config objects (`{ timeout: 5000, retries: 3, ...whatever }`) are common sources of bugs. Typed config means the LLM knows what options exist and what values are valid.

## 4. Predictable File Structure

### 4.1 Organize by Domain or Feature
Files grouped by what they do (all user-related code together) are easier to navigate than files grouped by technical layer (all models in one folder, all controllers in another). The LLM working on a feature can find everything in one place.

### 4.2 Consistent File Naming Conventions
When model files are always `ModelName.ts`, test files are always `ModelName.test.ts`, and schema files are always `modelName.ts` in a predictable directory, the LLM can find files without searching. Inconsistent naming requires grep for every lookup.

### 4.3 Colocate Related Files
Tests next to source, types next to implementation, schemas next to handlers — colocation means the LLM finds related code in fewer hops. Spreading related files across distant directories increases the number of files that must be read.

### 4.4 Avoid Mega-Files
Files over ~500 lines force the LLM to work with partial context. It reads a portion, makes assumptions about the rest, and those assumptions may be wrong. Multiple small files are better than one large file, even if they add a few imports.

### 4.5 Avoid Deeply Nested Directory Structures
`src/modules/core/domain/entities/user/validators/email/index.ts` is hard to navigate and remember. Flatter structures with descriptive names are easier for the LLM to hold in its mental model of the project.

### 4.6 One Concept Per File
A file that exports a single model, a single utility, or a single handler is easy to understand and modify. A file that exports 15 loosely related functions becomes a grab-bag that the LLM has to read entirely to find what it needs.

## 5. Small, Focused Units

### 5.1 Short Functions (Under ~50 Lines)
Long functions require the LLM to track state across many lines. Variable mutations, conditional branches, and early returns compound — accuracy drops as length increases. Short functions can be understood in a single pass.

### 5.2 Few Function Parameters (3-4 Max, Then Use Options Objects)
Positional parameters beyond 3-4 become ambiguous at call sites. `createUser("Jo", id1, id2, 5, null, false)` is unreadable. Options objects are self-documenting: `createUser({ name: "Jo", classId: id1, grade: 5 })`.

### 5.3 Avoid Boolean Parameters
`doThing(true, false, true)` is meaningless without reading the definition. Named options or separate functions are clearer: `doThing({ validate: true, cache: false, log: true })`.

### 5.4 Single Responsibility Per Function
A function that validates, transforms, saves, and notifies is doing four things. The LLM modifying the validation logic might accidentally break the notification. Separate functions for separate concerns.

### 5.5 Small, Focused Modules
A module (file or package) with a narrow, clear purpose is easier to understand than a utility grab-bag. The LLM can read the whole module and hold its complete behavior in context.

### 5.6 Limit Branching Depth
Deeply nested if/else chains and switch statements with complex conditions are hard to reason about. Each level of nesting multiplies the mental state the LLM needs to track. Early returns and guard clauses flatten the logic.

## 6. Clean Signal-to-Noise Ratio

### 6.1 Delete Dead Code
Dead code shows up in search results, gets used as examples for new code, and wastes context window. The LLM can't tell dead code from live code without tracing all callers. Git preserves history — delete it from source.

### 6.2 Remove Commented-Out Code
Commented-out code is the worst form of dead code. It's ambiguous — is it a TODO, a fallback, a reference, or a mistake? The LLM often treats it as a hint about intended behavior. Delete it or convert it to an explicit TODO with context.

### 6.3 Eliminate Unnecessary Duplication
Duplicated logic means the LLM may find and fix one copy but miss the others. It also creates conflicting examples when copies drift apart. Extract shared logic into a single canonical location.

### 6.4 Remove Stale Comments and TODOs
Comments that describe what code used to do, TODOs from years ago, and references to deleted features mislead the LLM. Comments should describe the current state, not the historical state.

### 6.5 Minimize Boilerplate
Repetitive boilerplate dilutes the meaningful code. When 30% of every file is identical scaffolding, the LLM spends context window on noise. Abstractions that reduce boilerplate (shared base classes, factory functions, conventions) help.

### 6.6 Avoid Unnecessary Abstraction Layers
Empty pass-through layers that exist "for future flexibility" add code to read without adding information. Every layer the LLM has to traverse to understand a feature reduces its accuracy. Only abstract when there's a concrete reason.

### 6.7 Keep Configuration Minimal
Excessive configuration options, feature flags for shipped features, and backwards-compatibility shims for long-completed migrations all add noise. The LLM reads these and tries to account for all paths, even ones that are never taken.

## 7. Good Naming

### 7.1 Use Descriptive, Specific Names
`calculateMonthlyRevenue` is one search away. `calc`, `process`, `handle`, `doWork` are meaningless without context. The LLM relies heavily on names to understand intent before reading implementation.

### 7.2 Use Grep-Friendly Names
Unique, specific names that appear in only a few files are easy to trace. Generic names that appear in hundreds of files make navigation slow and unreliable.

### 7.3 Name Booleans as Questions
`isActive`, `hasPermission`, `shouldRetry` are immediately clear. `active`, `permission`, `retry` are ambiguous — are they booleans, strings, functions?

### 7.4 Name Functions as Actions
`getUser`, `validateInput`, `sendNotification` clearly communicate what a function does. `user`, `input`, `notification` as function names say nothing about behavior.

### 7.5 Avoid Abbreviations and Acronyms
`getStudentClassRelationship` is unambiguous. `getStdClsRel` requires domain knowledge the LLM may not have. Spell things out unless the abbreviation is universally understood (e.g., `id`, `url`).

### 7.6 Consistent Domain Language
When a student is called `student` in one file, `pupil` in another, and `kid` in a third, the LLM can't tell if these are the same concept or different ones. Use one term consistently and document it.

### 7.7 Match File Names to Exports
When `UserService.ts` exports `UserService`, the LLM can navigate by file name alone. When `helpers.ts` exports `validateEmailFormat`, the LLM has to read the file to know what's in it.

## 8. Architectural Documentation

### 8.1 High-Level Architecture Overview
A short document explaining the major components, how they connect, and what each one is responsible for. This is the "map" that prevents the LLM from reconstructing architecture from individual files.

### 8.2 Documented Conventions and Patterns
Which patterns to follow, which libraries to use, which approaches are preferred. Without this, the LLM infers conventions from whatever code it happens to read first — which may be the exception, not the rule.

### 8.3 Documented Business Rules and Constraints
Rules that aren't obvious from the code: "students can exist in multiple classes," "never mix mongo and mysql in one transaction," "parent connections require approval." These are the rules the LLM will violate if they're not written down.

### 8.4 Documented Data Flow
How a request moves through the system, how data gets transformed, where side effects happen. Without this, the LLM has to trace the entire flow by reading code, which is slow and error-prone.

### 8.5 Migration and Legacy Context
What's being deprecated, what's replacing it, what's in an intermediate state. Without this, the LLM may build on deprecated patterns or conflict with in-progress migrations.

### 8.6 Keep Documentation Close to Code
Documentation in a separate wiki goes stale. Documentation in the repo (CLAUDE.md, README files, inline comments on non-obvious decisions) stays closer to current reality and is actually read by the LLM.

## 9. Fast, Reliable Tests

### 9.1 Tests as Executable Documentation
Good tests show the LLM what a function should do with specific inputs and outputs. They're more reliable than comments because they're verified on every run.

### 9.2 Fast Individual Test Execution
When the LLM can run a single test file in seconds, it can iterate quickly — make a change, run the test, adjust. When tests take minutes or require a full suite run, the feedback loop breaks.

### 9.3 Deterministic Tests (No Flakiness)
Flaky tests erode trust. If a test fails, the LLM needs to know whether the failure is caused by its change or by randomness. Flaky tests make that distinction impossible.

### 9.4 Isolated Tests
Tests that depend on shared state, external services, or execution order are fragile and hard to reason about. The LLM can't predict what state the test environment is in. Isolated tests with clean setup/teardown are predictable.

### 9.5 Descriptive Test Names
`it("should return null when user is not found")` tells the LLM the expected behavior without reading the test body. `it("works correctly")` says nothing.

### 9.6 Simple Test Fixtures
Complex test fixture setups that require tracing through multiple factory functions and helper files are hard for the LLM to understand and replicate. Simple, inline fixtures are more verbose but immediately clear.

### 9.7 Good Coverage of Edge Cases
Tests that document edge cases (null inputs, empty arrays, boundary conditions) teach the LLM what to watch out for. Without these, the LLM only knows the happy path.

## 10. Shallow Dependency Graphs

### 10.1 Avoid Deep Inheritance Hierarchies
Understanding a method on a class that extends a class that extends a class requires reading N files. Each level of inheritance adds indirection. Composition (using objects) is easier to trace than inheritance (extending classes).

### 10.2 Avoid Long Middleware or Plugin Chains
When a request passes through 8 middleware layers before reaching the handler, the LLM has to read all 8 to understand what state the request is in by the time it arrives. Shorter chains or explicit transformation steps are easier.

### 10.3 Minimize Circular Dependencies
Circular dependencies make it impossible to understand module A without understanding module B, which requires understanding module A. The LLM gets stuck in a loop and loses accuracy.

### 10.4 Prefer Direct Imports Over Indirection
Re-exports, barrel files, and index files that aggregate and re-export from submodules add hops between the import site and the actual code. Direct imports to the source file are easier to follow.

### 10.5 Minimize Cross-Module Side Effects
When importing or calling module A silently modifies the state of module B, the LLM can't predict the effect of changes. Explicit data flow (pass data in, get data out) is traceable.

### 10.6 Keep the Call Stack Shallow
When a function calls a function calls a function calls a function to do one thing, the LLM has to trace through all layers to understand the behavior. Flatter call stacks with fewer intermediaries are easier to reason about.

### 10.7 Limit the Number of Files Needed to Understand a Feature
If implementing or modifying a feature requires reading 15+ files, the LLM's accuracy drops. Designs where most features can be understood by reading 3-5 files are significantly easier to work with.

---

**The meta-principle behind all of these:** LLMs build a mental model of your codebase from whatever they read in a session. Every sub-issue above either makes that model faster to build, more accurate, or harder to corrupt. The codebase is the prompt — and these are the factors that determine how good that prompt is.
