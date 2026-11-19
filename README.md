# Mastery OS

> A local-first, file-based, Git-native personal knowledge mastery
> system.

## 1. Product Vision

Mastery OS helps people understand what they truly know, discover
knowledge gaps, learn efficiently, and verify long-term mastery.

Its central principle is:

**Knowledge is not the same as mastery.** Reading, taking notes, or
completing a course does not prove that someone understands or can apply
a concept.

Mastery OS is not intended to replace existing note-taking tools. It
should work with ordinary files and external knowledge sources while
keeping the user's learning state portable and under their control.

### Product principles

-   **Local-first:** Core features work without an internet connection.
-   **File-based:** User data is stored in readable, portable files.
-   **Git-native:** History, branching, diffing, backup, and optional
    synchronization use Git.
-   **User-owned data:** The application is not the only way to access
    or understand the data.
-   **Evidence-based mastery:** Mastery decisions must be supported by
    assessment evidence.
-   **Modular intelligence:** Agents and plugins provide capabilities
    without owning core learning data.

## 2. Product Scope

### Core concepts

-   **Workspace:** A long-lived knowledge domain, such as AI,
    mathematics, or physics.
-   **Project:** A concrete learning or research goal within a
    Workspace.
-   **Concept:** The fundamental unit of knowledge. A Concept is not
    simply a note.
-   **Evidence:** A record of demonstrated knowledge or ability.
-   **Mastery:** The system's current assessment of a user's capability,
    derived from evidence.
-   **Blindspot:** A suspected or confirmed gap, misconception, or
    weakness.
-   **Intervention:** A learning activity designed to address a specific
    gap.

### Main user experience

The user describes a goal or asks a question. A Workspace-level
SuperAgent decides whether to answer directly or coordinate specialist
agents and plugins.

The user can inspect and intervene in the execution process, but does
not need to manually manage an agent team.

## 3. Concept Lifecycle

1.  **Discovery** --- Identify Concepts from user goals, questions,
    resources, projects, and assessment results.
2.  **Modeling** --- Define each Concept, its learning objectives,
    prerequisites, relationships, and sources.
3.  **Assessment Design** --- Define what mastery means before teaching
    begins.
4.  **Diagnosis** --- Estimate the user's current ability without
    assuming they are a beginner.
5.  **Blindspot Detection** --- Identify possible knowledge, reasoning,
    application, prerequisite, or retention gaps.
6.  **Intervention** --- Select teaching methods and exercises suited to
    the diagnosed gap.
7.  **Verification** --- Use independent questions or tasks to verify
    learning, preferably with unfamiliar examples.
8.  **Monitoring** --- Track retention, review needs, and the ability to
    transfer knowledge to new situations.

### Assessment dimensions

Mastery should not be represented by one score alone. Assess these
dimensions separately:

-   Recall
-   Understanding
-   Reasoning
-   Application
-   Transfer

A correct answer once does not automatically prove mastery. Not tested
must remain distinct from weak performance.

### Mastery states

-   `not_assessed`
-   `diagnosed`
-   `learning`
-   `provisional_mastery`
-   `mastered`
-   `needs_review`

The exact state and score calculation rules should be versioned and
refined as the product evolves.

## 4. System Architecture

Mastery OS has three main layers.

### 4.1 Knowledge Layer

Owns the user's durable data:

-   Workspaces and Projects
-   Concepts and relationships
-   Assessment criteria and results
-   Evidence
-   Blindspots and interventions
-   Current mastery state and history
-   References to learning resources

The Knowledge Layer is independent of any particular agent framework.

### 4.2 Intelligence Layer

Provides reasoning and learning capabilities:

-   SuperAgent / Workspace orchestrator
-   Teacher Agent
-   Assessment Agent
-   Evaluator Agent
-   Research Agent
-   Planning Agent
-   Extensible plugins and skills

The SuperAgent selects and coordinates capabilities. Specialist agents
produce results and proposed changes; they do not directly own or
overwrite authoritative mastery state.

### 4.3 Local Infrastructure Layer

Provides local execution and data management:

-   File system: authoritative user data
-   Git: history, branches, diffs, and optional synchronization
-   SQLite: rebuildable local index and query acceleration
-   Local model runtime: optional offline AI
-   Optional cloud model adapters: only when configured and connectivity
    is available

## 5. Local-first and File-based Data Model

### Source of truth

The file system is the authoritative source for user data. SQLite is a
derived index, not the canonical database.

Deleting the local index must not cause data loss. The application
should be able to rebuild it by scanning the Workspace files.

### Suggested Workspace structure

``` text
MyWorkspace/
├── .git/
├── workspace.yaml
├── projects/
│   └── learn-transformers/
│       └── project.yaml
├── concepts/
│   ├── transformer.md
│   └── self-attention.md
├── assessments/
│   └── self-attention/
│       ├── criteria.yaml
│       └── sessions/
│           └── session-001.json
├── evidence/
│   └── self-attention/
│       ├── evidence-001.json
│       └── evidence-002.json
├── mastery/
│   └── self-attention.yaml
├── blindspots/
├── interventions/
├── resources/
│   ├── papers/
│   └── attachments/
└── .mastery/
    ├── index.db
    ├── cache/
    └── runtime/
```

### File format conventions

  -----------------------------------------------------------------------
  Data                    Format                  Purpose
  ----------------------- ----------------------- -----------------------
  Concept                 Markdown with YAML      Human-readable
                          frontmatter             knowledge definition

  Workspace / Project     YAML                    Structured
                                                  configuration

  Assessment criteria     YAML                    Versioned evaluation
                                                  rules

  Assessment session /    JSON                    Structured assessment
  response                                        records

  Evidence                JSON                    Append-only assessment
                                                  evidence

  Current mastery         YAML                    Human-readable current
                                                  projection

  Resources               Original file formats   PDF, images, code, and
                                                  other materials

  Search index / cache    SQLite and local files  Rebuildable application
                                                  data
  -----------------------------------------------------------------------

Prefer small, independently addressable files over one large file that
multiple agents or devices must edit.

### Example Concept

``` markdown
---
id: concept-self-attention
name: Self-Attention
prerequisites:
  - concept-matrix-multiplication
  - concept-probability
status: active
---

# Self-Attention

## Description

A mechanism that calculates relationships between tokens in a sequence.

## Learning Objectives

- Explain Query, Key, and Value.
- Explain how attention scores are calculated.
- Explain the role of softmax.
- Interpret attention weights.
```

### Example Evidence

``` json
{
  "id": "evidence-001",
  "concept_id": "concept-self-attention",
  "assessment_type": "independent_verification",
  "criteria_version": 1,
  "dimensions": {
    "recall": 0.9,
    "understanding": 0.85,
    "reasoning": 0.8,
    "application": 0.7,
    "transfer": 0.6
  },
  "confidence": 0.88,
  "created_at": "2026-11-19T10:00:00Z"
}
```

The examples are illustrative. A formal file-format specification must
define required fields, validation, ID rules, and schema versions.

## 6. Git and Data Integrity

Git is the version-control and synchronization mechanism, not the
runtime database.

Expected capabilities:

-   Review learning history through commits and diffs.
-   Experiment with alternative learning plans or Concept models using
    branches.
-   Restore previous versions.
-   Synchronize through user-chosen Git hosting, a self-hosted server,
    local network, or removable storage.
-   Keep working locally when synchronization is unavailable.

### Commit boundaries

Avoid committing every tiny generated sentence. Prefer meaningful
transactions such as:

-   Concept created or materially revised
-   Assessment session completed
-   Evidence recorded
-   Intervention completed
-   Mastery projection updated

### Conflict and concurrency rules

-   Evidence is append-only; each evidence record gets its own file.
-   Agents submit proposed changes through the Knowledge Layer rather
    than editing authoritative files arbitrarily.
-   Use atomic writes, file locks where needed, and version checks.
-   Derive current mastery from evidence and versioned rules where
    practical.
-   Provide a conflict-resolution experience for changes that cannot be
    merged safely.
-   Do not commit SQLite indexes, temporary files, or transient agent
    runtime state.

Large binary resources should not be treated like frequently changing
text files. Support ordinary file storage and consider Git LFS or
user-managed external storage for large assets.

## 7. Offline AI and Optional Connectivity

The application must remain useful without internet access.

### Offline mode

-   Read, create, edit, search, and organize local knowledge.
-   View assessment history and mastery state.
-   Run local agents and models when configured and supported by the
    device.
-   Rebuild indexes locally.
-   Continue recording evidence and learning activity.

### Optional online capabilities

Cloud models, remote research, and Git hosting may be configured as
optional integrations. They must not be prerequisites for accessing or
editing core data.

The application should clearly indicate when a task requires a remote
service. No user data should be sent to a cloud provider without the
configured integration and applicable user consent.

## 8. Agent and Plugin Responsibilities

-   **SuperAgent:** Understands goals, plans work, and coordinates
    agents and plugins.
-   **Teacher Agent:** Explains concepts and creates learning
    activities.
-   **Assessment Agent:** Produces assessment tasks based on criteria.
-   **Evaluator Agent:** Evaluates responses and produces structured
    evaluation results.
-   **Research Agent:** Finds and synthesizes information from available
    local or configured remote sources.
-   **Planning Agent:** Organizes learning goals and schedules.

### Architectural boundaries

-   A plugin provides a capability.
-   A skill provides reusable instructions or a workflow.
-   A tool performs a concrete operation.
-   An agent uses capabilities to complete a task.
-   The SuperAgent coordinates agents and capabilities.

Plugins may submit Evidence or proposed changes. **Only the Knowledge
Layer / Mastery Core may validate evidence and update authoritative
mastery state.**

Cordis may be used for TypeScript plugin composition and lifecycle
management. The Mastery Core must not depend on Cordis APIs. A more
specialized workflow engine can be introduced later if durable
pause/resume and complex human approval flows become necessary.

## 9. Mastery Core Responsibilities

The Mastery Core is a domain module, not merely CRUD operations.

Core responsibilities:

-   Validate Concept and assessment references.
-   Validate evidence against the relevant criteria version.
-   Preserve historical evidence.
-   Calculate mastery dimensions and confidence.
-   Apply explicit mastery state-transition rules.
-   Update the current mastery projection.
-   Record mastery history.
-   Schedule review when appropriate.

Illustrative operations:

``` text
submit_evidence()
evaluate_mastery()
recalculate_mastery()
update_mastery_projection()
schedule_review()
```

The Mastery Core can be tested and run without starting the agent
runtime or an LLM.

## 10. Initial Technical Direction

  Area                         Initial direction
  ---------------------------- -------------------------------------------------------------
  Desktop application          Tauri
  UI                           React + TypeScript
  Agent / plugin composition   Cordis, behind an adapter boundary
  Core data                    Markdown, YAML, JSON, and original resource files
  Version control              Git
  Local index                  SQLite
  Local AI                     Optional local model runtime
  Remote AI                    Optional provider adapters
  Search                       Filesystem scan + SQLite full-text search initially
  Vector search                Optional future enhancement
  Mobile                       Evaluate after desktop workflow and file protocol stabilize

This is a starting direction, not a requirement to adopt every component
immediately. The file protocol and core domain boundaries should be
established before committing to a larger infrastructure stack.

## 11. MVP Priorities

### Phase 1 --- Local knowledge foundation

-   Create and open local Workspaces.
-   Define the directory structure and file schemas.
-   Create, edit, and link Concepts.
-   Import and reference local resources.
-   Initialize and manage Git repositories.
-   Build and rebuild the SQLite index.

### Phase 2 --- Mastery Core

-   Define assessment criteria.
-   Record assessment sessions and Evidence.
-   Implement mastery dimensions and state transitions.
-   Display mastery history.
-   Track blindspots and interventions.

### Phase 3 --- Local intelligence

-   Add the SuperAgent and a small set of specialist agents.
-   Connect agents to the Mastery Core through explicit interfaces.
-   Support local model providers.
-   Make agent execution inspectable and recoverable.

### Phase 4 --- Optional integrations

-   Remote model providers.
-   Research integrations.
-   Git hosting synchronization.
-   Additional plugins and mobile clients.

## 12. Key Design Decisions to Preserve

1.  Local files are the source of truth; SQLite is rebuildable.
2.  Git is optional for basic file access but is a first-class
    version-control workflow.
3.  Core learning features must not require an account, server, or
    internet connection.
4.  Evidence is append-only and must retain the criteria version used to
    evaluate it.
5.  Mastery state is derived from evidence and explicit rules, not
    directly assigned by an agent.
6.  Agent runtime and Mastery Core remain independent.
7.  Cloud AI and remote integrations are optional adapters.
8.  Keep the initial implementation small; add distributed
    infrastructure only when a concrete requirement demands it.

## 13. Open Questions

-   Should a Workspace always map to exactly one Git repository, or can
    a repository contain multiple Workspaces?
-   What is the canonical ID and schema-versioning strategy for Concepts
    and Evidence?
-   How should schema migrations work while preserving compatibility
    with older files?
-   How should multiple devices and concurrent edits be reconciled?
-   Which local model runtimes and hardware profiles should be supported
    first?
-   What is the minimum viable mobile experience for a file-based
    system?
