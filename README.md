# Mastery OS
## Product Requirements & Technical Architecture

**Document Version:** 1.0  
**Date:** November 19, 2026  
**Status:** Initial Product & Architecture Specification  
**Product Category:** AI-powered Personal Knowledge Mastery System

---

# 1. Product Overview

## 1.1 Product Vision

Mastery OS is an AI-powered personal knowledge mastery system designed to help users understand, learn, evaluate, and continuously improve their knowledge.

Its primary objective is not to help users collect or organize information.

Instead, it aims to answer three fundamental questions:

1. What do I actually know?
2. What do I think I know but do not truly understand?
3. What should I learn next to achieve my goals?

Traditional note-taking applications focus on storing knowledge. Traditional learning management systems focus on course completion and learning progress.

Mastery OS focuses on **verifiable knowledge mastery**.

It uses AI Agents, adaptive assessments, knowledge dependency models, and continuous evaluation to understand a user's actual capabilities and identify knowledge gaps that the user may not even be aware of.

The system acts as a personal AI tutor, learning advisor, research assistant, and knowledge evaluator.

## 1.2 Core Philosophy

The product is built around the following principles.

### Knowledge Is Not Mastery

Reading a document, completing a course, or writing a note does not necessarily mean understanding the subject.

Mastery OS must distinguish between:

- Information the user has encountered.
- Knowledge the user can recall.
- Concepts the user understands.
- Problems the user can independently solve.
- Knowledge the user can transfer to unfamiliar situations.

### Assessment Before Instruction

The system should not automatically assume that users are beginners.

Before teaching a concept, it should evaluate the user's existing knowledge and determine what actually needs to be learned.

### Evidence-Based Mastery

A mastery state must be supported by assessment evidence.

The system must not declare mastery simply because:

- The user completed a lesson.
- The user said they understood.
- The user answered one question correctly.
- An AI-generated summary appears correct.

### Continuous Learning

Mastery is not permanent.

Knowledge can be forgotten, misunderstood, or become difficult to apply.

The system should continuously monitor knowledge retention and update mastery states based on new evidence.

### User-Centered Learning

Users should not be forced to change their existing note-taking habits.

They can continue using:

- Obsidian
- Notion
- Markdown
- PDF documents
- Web articles
- Books
- Personal notes
- Other external knowledge sources

Mastery OS should integrate with these sources instead of attempting to replace every existing knowledge-management tool.

---

# 2. Product Goals and Non-Goals

## 2.1 Primary Goals

1. Build a structured model of the user's knowledge across different domains.
2. Identify what the user knows and does not know.
3. Detect hidden knowledge gaps and misconceptions.
4. Generate adaptive learning plans.
5. Provide personalized teaching and practical exercises.
6. Verify mastery through independent assessments.
7. Track knowledge retention over time.
8. Support independent learning and research.
9. Provide an extensible Plugin ecosystem.
10. Maintain persistent context across learning sessions.

## 2.2 Non-Goals

Mastery OS is not primarily intended to be:

- Another traditional note-taking application.
- A document editor.
- A replacement for Obsidian or Notion.
- A static online course platform.
- A chatbot with persistent conversation history.
- A system that measures learning progress only through completed tasks.
- A collection of manually configured AI Agents.

Knowledge organization is useful, but it is not the central product value.

---

# 3. Core Product Architecture

The product is organized around five major systems.

| System | Responsibility |
|---|---|
| Workspace System | Organize knowledge domains and projects |
| SuperAgent System | Understand goals and coordinate AI work |
| Mastery Core | Maintain concepts, assessment standards, evidence, and mastery states |
| Context System | Maintain persistent user and workspace context |
| Plugin System | Provide extensible learning, assessment, research, and practical capabilities |

External knowledge sources provide supporting information to these systems.

## 3.1 High-Level Architecture

```text
                  User
                   |
          Cross-Platform GUI
                   |
          Workspace Interface
                   |
          SuperAgent Runtime
                   |
       +-----------+-----------+
       |           |           |
    Planning   Delegation   Scheduling
       |           |           |
       +-----------+-----------+
                   |
              Agent Team
                   |
       +-----------+-----------+
       |           |           |
     Teacher    Evaluator    Research
       Agent      Agent       Agent
       |           |           |
       +-----------+-----------+
                   |
             Plugin Runtime
                   |
       +-----------+-----------+
       |           |           |
   Assessment   Teaching    Research
     Plugin      Plugin      Plugin
       |           |           |
       +-----------+-----------+
                   |
               Mastery Core
                   |
       +-----------+-----------+
       |           |           |
    Concepts    Evidence    Mastery
       |           |           |
       +-----------+-----------+
                   |
              Context System
                   |
          Persistent Storage
                   |
          External Integrations
```

Mastery Core is the authoritative system for user mastery data.

Agents and Plugins can generate assessments, teaching materials, and evaluation evidence, but they should not independently maintain conflicting mastery states.

---

# 4. Workspace and Project Management

## 4.1 Workspace

A Workspace represents a long-term knowledge domain.

Examples:

- Artificial Intelligence
- Physics
- Mathematics
- Computer Science
- Economics
- Biology

Each Workspace has its own:

- Domain knowledge model.
- Concept registry.
- Learning objectives.
- Projects.
- Mastery records.
- Assessment history.
- Context.
- SuperAgent.
- Agent execution history.

A Workspace is not merely a folder containing documents.

It represents a persistent learning and research environment.

## 4.2 Workspace SuperAgent

Every Workspace has a SuperAgent responsible for coordinating its activities.

The SuperAgent acts as:

- Learning advisor.
- Research coordinator.
- Task planner.
- Agent orchestrator.
- Progress monitor.
- Context manager.

Users should interact primarily with the SuperAgent rather than manually selecting individual Agents.

For example:

"I want to learn quantum mechanics from zero and eventually understand its fundamental principles."

The SuperAgent should:

1. Understand the learning objective.
2. Determine the required knowledge scope.
3. Identify prerequisite concepts.
4. Evaluate the user's existing knowledge.
5. Create a learning roadmap.
6. Select appropriate Agents and Plugins.
7. Monitor progress.
8. Adjust the roadmap when new knowledge gaps are discovered.

## 4.3 Project

A Project represents a specific learning or research objective inside a Workspace.

Examples:

- Learn Quantum Mechanics from Zero.
- Understand Transformer Architecture.
- Research Renewable Energy Storage.
- Implement a Small Language Model.

A Project contains:

- Objective.
- Scope.
- Milestones.
- Related Concepts.
- Learning Tasks.
- Research Tasks.
- Resources.
- Assessment Results.
- Deliverables.
- Execution History.

A Project may reference concepts from multiple Workspaces.

## 4.4 Workspace and Project Relationship

```text
Workspace: Artificial Intelligence
|
+-- Project: Learn Deep Learning
|   |
|   +-- Neural Networks
|   +-- Backpropagation
|   +-- Optimization
|
+-- Project: Understand LLMs
|   |
|   +-- Transformer
|   +-- Self-Attention
|   +-- Tokenization
|
+-- Project: Build an AI Agent
    |
    +-- Tool Calling
    +-- Agent Runtime
    +-- Context Management
```

Concepts should not necessarily be duplicated when referenced by multiple Projects.

The system should maintain a shared Concept identity while allowing different learning objectives and assessment contexts.

---

# 5. Mastery Core

Mastery Core is the central component of the product.

It maintains the user's knowledge model and determines whether the user has actually mastered individual concepts.

## 5.1 Knowledge vs. Mastery

Knowledge and Mastery are related but different.

**Knowledge** describes information about the world.

Examples:

- Definitions.
- Explanations.
- Formulas.
- Principles.
- Relationships.
- Learning materials.

**Mastery** describes the user's demonstrated ability to understand and use that knowledge.

Examples:

- Can explain a concept independently.
- Can derive a formula.
- Can solve an unfamiliar problem.
- Can identify incorrect assumptions.
- Can transfer knowledge to another domain.

The Knowledge Layer provides the information.

The Mastery Layer maintains the user's verified capabilities.

## 5.2 Concept as the Fundamental Unit

Concept is the primary domain entity.

A Concept represents an independently assessable knowledge unit.

Example:

```text
Concept
|
+-- Identity
|   +-- ID
|   +-- Name
|   +-- Description
|   +-- Domain
|
+-- Knowledge Model
|   +-- Definition
|   +-- Explanation
|   +-- Examples
|   +-- Related Concepts
|
+-- Dependencies
|   +-- Prerequisites
|   +-- Dependent Concepts
|
+-- Learning Objectives
|
+-- Assessment Criteria
|
+-- User Mastery State
|
+-- Evidence History
```

A Concept should be small enough to assess independently but sufficiently meaningful to represent an actual capability.

The system must support hierarchical and dependency relationships between concepts.

## 5.3 Concept Lifecycle

Every Concept follows a continuous lifecycle.

```text
Discovery
    |
    v
Modeling
    |
    v
Assessment Design
    |
    v
Diagnosis
    |
    v
Blindspot Detection
    |
    v
Intervention
    |
    v
Verification
    |
    v
Monitoring
    |
    +------> Reassessment
                 |
                 +----> Intervention
```

The lifecycle is evidence-driven rather than strictly linear.

Users may skip stages when existing evidence is sufficient.

### Stage 1: Discovery

Concepts can be discovered from:

- User learning objectives.
- Existing learning roadmaps.
- Books and textbooks.
- Online courses.
- Research papers.
- User questions.
- Assessment results.
- Practical projects.
- Newly discovered prerequisite dependencies.

The Discovery component should identify candidate concepts and evaluate their relevance.

Concept discovery must distinguish between:

- Required concepts.
- Recommended concepts.
- Optional related concepts.

The system should avoid creating unnecessary concepts simply because they appear in a document.

### Stage 2: Modeling

The system creates a structured Concept definition.

Required information:

- Concept ID.
- Name.
- Description.
- Domain.
- Prerequisites.
- Related concepts.
- Learning objectives.
- Source references.

The system should validate:

- Whether the Concept is sufficiently independent.
- Whether its scope is too broad.
- Whether important prerequisites are missing.
- Whether its learning objectives can be assessed.

### Stage 3: Assessment Design

Before teaching, the system defines what mastery means.

Assessment criteria should include five primary dimensions:

| Dimension | Description |
|---|---|
| Recall | Can the user remember and reproduce the knowledge? |
| Understanding | Can the user explain the underlying principles? |
| Reasoning | Can the user derive, analyze, and reason about it? |
| Application | Can the user use it to solve practical problems? |
| Transfer | Can the user apply it in unfamiliar situations? |

Each dimension must have:

- Assessment criteria.
- Expected performance.
- Assessment methods.
- Passing conditions.
- Evidence requirements.

Assessment criteria should be versioned.

Changing assessment criteria should not silently invalidate historical assessment records.

### Stage 4: Diagnosis

The system evaluates the user's current knowledge.

It should use adaptive assessment:

1. Start with basic questions.
2. Evaluate the response.
3. Increase difficulty when appropriate.
4. Investigate prerequisites when performance is weak.
5. Stop testing dimensions for which sufficient evidence already exists.

The system should record:

- Questions.
- User responses.
- Reasoning.
- Correctness.
- Difficulty.
- Hints used.
- Time taken.
- Evaluation results.
- Confidence.

Not Assessed must be different from Failed.

The absence of evidence must not automatically mean the user has no knowledge.

### Stage 5: Blindspot Detection

The system identifies hidden knowledge gaps.

Blindspot categories:

| Type | Description |
|---|---|
| Knowledge Gap | The user has not learned the required knowledge |
| Understanding Gap | The user has encountered the material but does not understand it |
| Misconception | The user holds an incorrect mental model |
| Application Gap | The user understands the concept but cannot use it |
| Prerequisite Gap | Required foundational knowledge is missing |
| Retention Gap | Previously learned knowledge has been forgotten |

Blindspot detection should be hypothesis-driven.

The system must not conclude that a user has a specific weakness based on one ambiguous answer.

Instead:

1. Detect an abnormal or incorrect response.
2. Generate possible root-cause hypotheses.
3. Design targeted diagnostic questions.
4. Validate the hypothesis.
5. Record the confirmed or unresolved blindspot.

### Stage 6: Intervention

The SuperAgent selects appropriate teaching methods.

| Problem | Intervention |
|---|---|
| Knowledge Gap | Introduce foundational material |
| Understanding Gap | Explain using alternative examples |
| Misconception | Challenge incorrect assumptions |
| Application Gap | Assign practical exercises |
| Prerequisite Gap | Teach prerequisite concepts |
| Retention Gap | Schedule active recall and revision |

Teaching methods may include:

- Direct explanation.
- Socratic questioning.
- Analogies.
- Worked examples.
- Interactive exercises.
- Simulations.
- Coding exercises.
- Experiments.
- Research assignments.
- Discussion and debate.

Teaching should adapt based on the user's response.

### Stage 7: Verification

After intervention, the system verifies whether mastery has been achieved.

Verification must use independent assessment.

It should not simply repeat the examples used during teaching.

Recommended verification levels:

1. Independent Recall.
2. Problem Solving.
3. Knowledge Transfer.

The Evaluator should evaluate the evidence against the predefined assessment criteria.

Teaching completion is not equivalent to mastery.

### Stage 8: Monitoring

Mastery continues to be monitored after verification.

The system tracks:

- Last verified date.
- Assessment history.
- Performance changes.
- Retention.
- Review results.
- Practical usage.
- Confidence in the mastery estimate.

When new evidence indicates that the user has forgotten or misunderstood a concept, the system should trigger reassessment.

## 5.4 Mastery State

Recommended mastery states:

| State | Meaning |
|---|---|
| Not Assessed | No sufficient assessment evidence |
| Diagnosed | Initial knowledge assessment completed |
| Learning | Active learning or intervention |
| Provisional Mastery | Initial mastery criteria satisfied, but evidence is not yet sufficiently robust |
| Mastered | Required criteria verified |
| Needs Review | New evidence or retention risk indicates reassessment is necessary |

Mastery state should be managed centrally by Mastery Core.

It should not be directly controlled by individual Agents.

## 5.5 Mastery Score and Confidence

A single percentage is insufficient to represent knowledge mastery.

The system should maintain:

- Dimension-level performance.
- Overall mastery estimate.
- Evidence confidence.
- Evidence recency.
- Assessment difficulty.
- Independence of performance.

Confidence and mastery are different.

A user may perform well in one assessment but still have low confidence because there is insufficient evidence.

An assessment model must not claim false precision.

Scores should be treated as estimates supported by evidence, not objective measurements of human intelligence.

---

# 6. Assessment System

The Assessment System is responsible for testing and evaluating the user's capabilities.

It should support multiple assessment types.

## 6.1 Assessment Types

### Recall Assessment

Tests whether the user can retrieve information without assistance.

Examples:

- Define a concept.
- Explain a formula.
- Recall important principles.

### Understanding Assessment

Tests whether the user understands why something works.

Examples:

- Explain the purpose of an algorithm.
- Describe the relationship between two concepts.
- Explain a mechanism using their own words.

### Reasoning Assessment

Tests the ability to derive and analyze.

Examples:

- Derive a mathematical formula.
- Analyze an algorithm.
- Identify assumptions in an argument.

### Application Assessment

Tests whether the user can use knowledge in practice.

Examples:

- Solve programming problems.
- Calculate mathematical results.
- Design a system.
- Conduct an experiment.

### Transfer Assessment

Tests whether the user can apply knowledge to unfamiliar situations.

Examples:

- Apply a known mathematical principle to another domain.
- Explain how an algorithm behaves under different conditions.
- Solve a problem with unfamiliar constraints.

## 6.2 Assessment Execution

An assessment should contain:

```text
AssessmentSession
|
+-- Concept
+-- AssessmentCriteria
+-- AssessmentMethod
+-- Questions
+-- UserResponses
+-- EvaluationResults
+-- Evidence
+-- Confidence
+-- Status
+-- Timestamp
```

## 6.3 Assessment Reliability

The system must avoid relying entirely on an LLM to generate, answer, and grade its own questions.

Different domains require different verification mechanisms.

Examples:

| Domain | Verification |
|---|---|
| Mathematics | Symbolic calculation and independent derivation |
| Programming | Code execution and automated tests |
| Physics | Numerical solutions and physical constraints |
| Language | Rubric-based evaluation |
| Research | Evidence quality and argument consistency |
| System Design | Requirement coverage and design reasoning |

LLMs can evaluate open-ended explanations, but evaluation should use explicit rubrics, multiple evidence samples, and confidence estimates.

Where deterministic verification is possible, it should be preferred.

## 6.4 Assessment Plugins

Examples:

- Recall Assessment Plugin.
- Reasoning Assessment Plugin.
- Practical Assessment Plugin.
- Transfer Assessment Plugin.
- Adaptive Quiz Plugin.
- Code Evaluation Plugin.
- Mathematical Verification Plugin.

All Assessment Plugins must return standardized evidence.

---

# 7. Agent System

## 7.1 Agent Architecture

The product uses a hierarchical Agent architecture.

```text
Workspace SuperAgent
|
+-- Teacher Agent
|
+-- Assessment Agent
|
+-- Evaluator Agent
|
+-- Research Agent
|
+-- Planning Agent
|
+-- Optional Specialized Agents
```

The actual Agents should be created or activated according to task requirements.

The system must not start every Agent for every request.

Simple questions should be handled directly.

Complex learning and research tasks may require multiple Agents.

## 7.2 SuperAgent Responsibilities

The SuperAgent is responsible for:

- Understanding user intent.
- Planning learning and research tasks.
- Selecting appropriate capabilities.
- Delegating work.
- Coordinating Agent execution.
- Reviewing results.
- Maintaining Workspace progress.
- Deciding what information should become persistent context.
- Triggering assessments and interventions.

The SuperAgent should not independently replace Mastery Core.

It orchestrates the process, while Mastery Core owns the mastery data.

## 7.3 Specialized Agents

### Teacher Agent

Responsible for:

- Explaining concepts.
- Designing teaching sessions.
- Providing examples.
- Answering questions.
- Conducting Socratic discussions.
- Adapting explanations.

### Assessment Agent

Responsible for:

- Generating assessment tasks.
- Selecting assessment methods.
- Conducting tests.
- Collecting responses.

### Evaluator Agent

Responsible for:

- Evaluating user responses.
- Applying assessment rubrics.
- Identifying incorrect reasoning.
- Producing evidence.
- Estimating evaluation confidence.

### Research Agent

Responsible for:

- Searching external resources.
- Reading papers and documents.
- Comparing sources.
- Summarizing research.
- Identifying relevant knowledge.

### Planning Agent

Responsible for:

- Creating learning roadmaps.
- Managing milestones.
- Prioritizing knowledge gaps.
- Recommending next steps.

Additional Agents can be introduced through Plugins.

---

# 8. Plugin System

## 8.1 Design Philosophy

The Plugin System provides extensibility without allowing external capabilities to compromise the platform's core data model.

The platform should support a broad Plugin ecosystem.

However, not everything should be a Plugin.

Core infrastructure should remain centrally managed.

## 8.2 Plugin vs. Skill vs. Tool vs. Agent

These concepts have different responsibilities.

| Component | Responsibility |
|---|---|
| Plugin | Installable and composable capability package |
| Skill | Reusable instructions and workflows |
| Tool | Executable operation or external interface |
| Agent | Autonomous execution unit using available capabilities |
| SuperAgent | High-level coordinator |
| Hook | Deterministic lifecycle control |
| MCP | Standardized connection to external tools and resources |

A Plugin may contain:

- Skills.
- Tools.
- Agent definitions.
- Assessment methods.
- UI extensions.
- External integrations.

## 8.3 Core Platform Responsibilities

The following should remain part of the platform:

- Workspace Management.
- Project Management.
- Context Management.
- Concept Registry.
- Mastery State Management.
- Evidence Storage.
- Agent Runtime.
- Task Management.
- Permissions.
- Data Synchronization.

## 8.4 Plugin-Extensible Capabilities

Examples:

| Plugin | Function |
|---|---|
| Discovery Plugin | Discover and structure concepts |
| Assessment Plugin | Generate and conduct assessments |
| Blindspot Plugin | Identify knowledge gaps |
| Teaching Plugin | Provide personalized instruction |
| Verification Plugin | Verify mastery |
| Retention Plugin | Track forgetting and schedule revision |
| Research Plugin | Search and analyze external knowledge |
| Paper Reader Plugin | Read and analyze academic papers |
| Code Evaluator Plugin | Execute and test programming tasks |
| Simulation Plugin | Conduct interactive experiments |
| Knowledge Graph Plugin | Visualize concept relationships |

## 8.5 Plugin Interface

Plugins should use standardized interfaces.

Example conceptual contract:

```python
class AssessmentPlugin:

    def get_supported_methods(self):
        ...

    def assess(self, request):
        ...

    def validate(self, result):
        ...

    def generate_evidence(self, result):
        ...
```

An assessment result should contain:

```json
{
  "concept_id": "self-attention",
  "assessment_criteria_id": "understanding-001",
  "method": "open_question",
  "result": "partial",
  "confidence": 0.82,
  "evidence": [],
  "recommendations": []
}
```

This is a conceptual interface, not a finalized API schema.

Plugins must not directly update Mastery State.

They submit evidence to Mastery Core.

## 8.6 Plugin Lifecycle

Recommended lifecycle:

```text
Discover
   |
Install
   |
Validate
   |
Configure Permissions
   |
Activate
   |
Execute
   |
Monitor
   |
Update / Disable / Uninstall
```

Plugin execution should be permission-controlled and isolated.

---

# 9. Context Management System

Persistent context is essential for long-term learning.

The system must distinguish between information storage, information retrieval, and model context injection.

These are three separate operations.

## 9.1 Three-Level Context Architecture

### Global Context

Shared across Workspaces.

Contains:

- User learning preferences.
- Long-term goals.
- General background.
- Cross-domain relationships.
- Global memory.
- Relevant learning history.

### Workspace Context

Shared within a specific Workspace.

Contains:

- Domain knowledge.
- Workspace objectives.
- Learning progress.
- Research history.
- Concept relationships.
- Project information.
- Workspace Agent outputs.

### Agent Context

Private to an Agent or Agent execution.

Contains:

- Current task state.
- Intermediate analysis.
- Temporary research results.
- Execution history.
- Working notes.
- Tool outputs.

## 9.2 Context Access, Retrieval, and Injection

These concepts must be separated.

**Context Access**

Determines which data an Agent is authorized to access.

**Context Retrieval**

Determines which information is relevant to the current task.

**Context Injection**

Determines which retrieved information is actually included in the model context.

Global access does not mean every Agent should receive all global information in every request.

## 9.3 Memory Types

Recommended memory categories:

- User Memory.
- Workspace Memory.
- Project Memory.
- Concept Memory.
- Agent Memory.
- Session Memory.

Memory should be continuously consolidated.

Short-term execution information should not automatically become permanent memory.

The system should support:

- Memory extraction.
- Memory summarization.
- Deduplication.
- Relevance scoring.
- Expiration policies.
- Context compaction.
- Memory retrieval.
- User-controlled deletion.

## 9.4 Context Retrieval

Potential retrieval methods:

- Metadata filtering.
- Full-text search.
- Semantic search.
- Hybrid search.
- Graph-based retrieval.
- Recent activity retrieval.

Retrieval should consider:

- Relevance.
- Recency.
- Workspace boundaries.
- Project scope.
- User permissions.
- Source reliability.

## 9.5 Context Isolation

Agents should receive only the information required for their tasks.

Private Agent Context must not automatically become shared Workspace Context.

Promotion to persistent context should be an explicit, controlled operation.

---

# 10. External Knowledge Integration

Mastery OS should integrate with existing knowledge sources rather than requiring users to migrate everything.

## 10.1 Supported Sources

Potential integrations:

- Obsidian.
- Notion.
- Markdown files.
- PDF documents.
- Websites.
- Academic papers.
- Books.
- Online courses.
- Git repositories.
- Cloud storage.

## 10.2 Knowledge Ingestion Pipeline

```text
External Source
      |
      v
Document Ingestion
      |
      v
Content Extraction
      |
      v
Normalization
      |
      v
Metadata Extraction
      |
      v
Chunking / Indexing
      |
      v
Knowledge Retrieval
      |
      v
Concept Discovery
```

The ingestion system should preserve source attribution.

Each extracted knowledge item should maintain references to its original source.

## 10.3 External Knowledge vs. Concept

An external document is not automatically a Concept.

A document may contain:

- Multiple concepts.
- Repeated concepts.
- Irrelevant information.
- Incorrect information.
- Conflicting explanations.

The system must identify and structure concepts independently of the original documents.

---

# 11. Learning Experience and User Interface

## 11.1 Product Interaction Model

The primary interaction model is Workspace-first with Agent-centric interaction.

It combines:

- Workspace-oriented navigation.
- SuperAgent as the main conversational entry point.
- Visible Agent activity.
- Structured mastery dashboards.
- Project and learning management.

Users should not need to manually manage an AI team.

They describe their goals, and the SuperAgent organizes the work.

## 11.2 Main Navigation

Recommended interface structure:

```text
Application
|
+-- Home
|
+-- Workspaces
|   |
|   +-- Artificial Intelligence
|   +-- Physics
|   +-- Mathematics
|
+-- Projects
|
+-- Mastery Dashboard
|
+-- Agent Activity
|
+-- Plugin Marketplace
|
+-- Settings
```

## 11.3 Workspace Interface

A Workspace should provide:

- Overview.
- SuperAgent conversation.
- Learning roadmap.
- Projects.
- Concept Explorer.
- Mastery Dashboard.
- Knowledge Sources.
- Agent Activity.
- Workspace Settings.

## 11.4 Mastery Dashboard

The dashboard should answer:

- What have I mastered?
- What am I currently learning?
- What are my weakest areas?
- What are my unresolved blindspots?
- What knowledge may have been forgotten?
- What should I learn next?

Possible visualizations:

- Concept dependency graph.
- Mastery distribution.
- Assessment history.
- Knowledge gap map.
- Learning progress.
- Retention timeline.

The interface should distinguish between verified knowledge and unassessed knowledge.

## 11.5 Concept Detail Page

Each Concept should provide:

- Description.
- Learning objectives.
- Prerequisites.
- Related concepts.
- Learning materials.
- Assessment criteria.
- Mastery dimensions.
- Assessment history.
- Blindspots.
- Teaching history.
- Evidence records.

Users should be able to inspect why the system considers a Concept mastered or not mastered.

## 11.6 Agent Activity Interface

Users should be able to observe:

- Active Agents.
- Current tasks.
- Execution status.
- Tool calls.
- Progress.
- Results.
- Errors.
- Pending approvals.

The interface should expose meaningful activity without overwhelming users with internal reasoning or unnecessary implementation details.

Users should be able to pause, cancel, or redirect appropriate tasks.

---

# 12. Learning Modes

The system should support multiple learning styles.

## 12.1 Structured Learning

The SuperAgent creates a complete learning roadmap.

Suitable for:

- Beginners.
- Academic subjects.
- Long-term learning objectives.

## 12.2 Adaptive Learning

The system evaluates the user's existing knowledge and dynamically adjusts the learning sequence.

Suitable for:

- Users with existing experience.
- Mixed-level learning.
- Efficient knowledge gap remediation.

## 12.3 Exploration Mode

Users can freely ask questions and explore topics.

The system gradually identifies relevant concepts and relationships.

Suitable for:

- Curiosity-driven learning.
- Independent research.
- Cross-domain exploration.

## 12.4 Hybrid Learning

Combines structured learning, adaptive assessment, and free exploration.

The system maintains a learning roadmap while allowing users to investigate topics outside the current sequence.

This should be the recommended default mode.

---

# 13. Technical Architecture

This section describes a proposed implementation architecture.

Technology choices are recommendations rather than finalized commitments.

## 13.1 Architecture Principles

1. Separate AI orchestration from business logic.
2. Keep Mastery Core independent of individual LLM providers.
3. Use asynchronous execution for long-running Agent tasks.
4. Persist execution state for failure recovery.
5. Use standardized Plugin interfaces.
6. Maintain strict data and permission boundaries.
7. Prefer deterministic verification when possible.
8. Support multiple LLM providers.
9. Make the system observable and testable.
10. Avoid unnecessary multi-Agent execution.

## 13.2 Recommended Technology Stack

| Layer | Recommended Technology |
|---|---|
| Web Frontend | React + TypeScript |
| Desktop | Tauri |
| Mobile | React Native or Flutter |
| Backend API | Python + FastAPI |
| Agent Runtime | Custom Agent Runtime / LangGraph |
| Primary Database | PostgreSQL |
| Vector Search | pgvector |
| Cache | Redis |
| Object Storage | S3-compatible storage |
| Search | PostgreSQL Full-Text Search initially; OpenSearch when needed |
| Async Processing | Redis-backed workers or Temporal |
| Authentication | OAuth 2.0 / OpenID Connect |
| Realtime Communication | WebSocket / Server-Sent Events |
| Containerization | Docker |
| Deployment | Cloud infrastructure |
| Monitoring | OpenTelemetry + Prometheus + Grafana |

The frontend should share domain models and API contracts across platforms where practical.

A modular monolith is recommended initially.

The architecture should avoid introducing microservices before there is a clear scaling or organizational requirement.

## 13.3 Backend Modules

Recommended logical modules:

```text
Backend
|
+-- Identity
|
+-- Workspace
|
+-- Project
|
+-- Concept
|
+-- Mastery
|
+-- Assessment
|
+-- Evidence
|
+-- Blindspot
|
+-- Learning
|
+-- Agent Runtime
|
+-- Plugin Runtime
|
+-- Context
|
+-- Knowledge Ingestion
|
+-- Integration
|
+-- Notification
|
+-- Analytics
```

Modules should have clear ownership of their data and business rules.

## 13.4 Agent Runtime

The Agent Runtime manages execution.

Core responsibilities:

- Agent lifecycle.
- Planning.
- Task delegation.
- Tool calling.
- Skill execution.
- Context retrieval.
- Execution state.
- Retry handling.
- Cancellation.
- Timeouts.
- Human approval.
- Logging.
- Token usage tracking.

Recommended execution model:

```text
User Request
     |
     v
SuperAgent
     |
     v
Task Planning
     |
     v
Execution Graph
     |
     v
Agent / Plugin / Tool
     |
     v
Result Validation
     |
     v
Mastery Core / Workspace
     |
     v
User Response
```

The runtime should support checkpointing.

Long-running tasks must be recoverable after process failures or deployment interruptions.

## 13.5 Agent Execution State

Recommended states:

- Pending.
- Planning.
- Running.
- Waiting for Tool.
- Waiting for Approval.
- Completed.
- Failed.
- Cancelled.

Every execution should have a persistent identifier.

The system should preserve:

- Task input.
- Execution plan.
- Agent assignments.
- Tool calls.
- Intermediate results.
- Checkpoints.
- Final output.
- Failure information.

---

# 14. Data Architecture

## 14.1 Primary Entities

### User

Stores identity and user-level preferences.

### Workspace

Represents a long-term knowledge domain.

### Project

Represents a specific learning or research objective.

### Concept

Represents an independently assessable knowledge unit.

### ConceptDependency

Represents prerequisite and dependency relationships.

### LearningObjective

Defines what the user should be able to do.

### AssessmentCriteria

Defines how mastery is evaluated.

### AssessmentSession

Represents an assessment execution.

### Evidence

Stores assessment evidence.

### Blindspot

Stores identified or suspected knowledge gaps.

### Intervention

Stores teaching and remediation activities.

### MasteryRecord

Stores the current and historical mastery state.

### ReviewSchedule

Stores future review requirements.

### AgentExecution

Stores Agent task execution information.

### Plugin

Stores installed Plugin metadata.

### KnowledgeSource

Represents external documents and knowledge sources.

### ContextMemory

Stores persistent contextual information.

## 14.2 Entity Relationships

```text
User
 |
 +-- Workspace
      |
      +-- Project
      |
      +-- Concept
      |    |
      |    +-- ConceptDependency
      |    |
      |    +-- LearningObjective
      |    |
      |    +-- AssessmentCriteria
      |    |
      |    +-- AssessmentSession
      |    |     |
      |    |     +-- Evidence
      |    |
      |    +-- Blindspot
      |    |
      |    +-- Intervention
      |    |
      |    +-- MasteryRecord
      |    |
      |    +-- ReviewSchedule
      |
      +-- AgentExecution
      |
      +-- KnowledgeSource
      |
      +-- ContextMemory
```

## 14.3 Data Storage Strategy

Recommended storage responsibilities:

**PostgreSQL**

- Users.
- Workspaces.
- Projects.
- Concepts.
- Assessment records.
- Evidence metadata.
- Mastery states.
- Plugin metadata.
- Agent execution metadata.

**Object Storage**

- Original documents.
- PDFs.
- Images.
- Large attachments.
- Generated learning materials.
- Large Agent outputs.

**Vector Database / pgvector**

- Semantic document retrieval.
- Context retrieval.
- Concept similarity.
- Related knowledge discovery.

**Redis**

- Caching.
- Short-lived execution state.
- Queue coordination.
- Realtime session support.

**Search Engine**

A dedicated search engine can be introduced when document search, filtering, and indexing requirements exceed the capabilities of PostgreSQL.

## 14.4 Evidence Immutability

Evidence should be append-oriented.

New assessments should create new evidence rather than silently overwrite previous results.

Mastery Core can calculate a new mastery state from historical evidence.

This preserves the ability to:

- Audit previous evaluations.
- Recalculate mastery.
- Compare progress.
- Investigate inconsistent results.
- Introduce improved evaluation algorithms.

---

# 15. API Design

The backend should expose versioned REST APIs for normal application operations.

WebSocket or Server-Sent Events should provide realtime Agent execution updates.

Representative API groups:

## 15.1 Workspace APIs

```http
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/{id}
PATCH  /api/v1/workspaces/{id}
DELETE /api/v1/workspaces/{id}
```

## 15.2 Project APIs

```http
POST   /api/v1/workspaces/{id}/projects
GET    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}
GET    /api/v1/projects/{id}/progress
```

## 15.3 Concept APIs

```http
POST   /api/v1/concepts
GET    /api/v1/concepts/{id}
PATCH  /api/v1/concepts/{id}
GET    /api/v1/concepts/{id}/dependencies
GET    /api/v1/concepts/{id}/mastery
GET    /api/v1/concepts/{id}/evidence
```

## 15.4 Assessment APIs

```http
POST   /api/v1/assessments
GET    /api/v1/assessments/{id}
POST   /api/v1/assessments/{id}/responses
POST   /api/v1/assessments/{id}/submit
GET    /api/v1/assessments/{id}/results
```

## 15.5 Mastery APIs

```http
GET    /api/v1/mastery/overview
GET    /api/v1/mastery/concepts/{id}
GET    /api/v1/mastery/history
GET    /api/v1/mastery/blindspots
GET    /api/v1/mastery/reviews
```

## 15.6 Agent APIs

```http
POST   /api/v1/agent/executions
GET    /api/v1/agent/executions/{id}
POST   /api/v1/agent/executions/{id}/cancel
POST   /api/v1/agent/executions/{id}/approve
GET    /api/v1/agent/executions/{id}/events
```

## 15.7 Plugin APIs

```http
GET    /api/v1/plugins
POST   /api/v1/plugins/install
POST   /api/v1/plugins/{id}/activate
POST   /api/v1/plugins/{id}/deactivate
DELETE /api/v1/plugins/{id}
```

These endpoints are representative and will require detailed request and response schemas during implementation.

---

# 16. Security and Permissions

The product may contain personal learning records, private documents, research materials, and external account connections.

Security must be designed into the architecture.

## 16.1 Authentication

Recommended:

- OAuth 2.0.
- OpenID Connect.
- Secure session management.
- Multi-device authentication.
- Optional MFA.

## 16.2 Authorization

Use role-based and resource-level permissions.

Potential roles:

- Workspace Owner.
- Workspace Member.
- Workspace Viewer.
- Agent.
- Plugin.

Agents should operate under the user's permission boundaries.

## 16.3 Plugin Security

Plugins should use:

- Explicit permission declarations.
- Tool-level authorization.
- Resource-level access control.
- Execution isolation.
- API rate limits.
- Audit logs.

Untrusted Plugins must not receive unrestricted database or filesystem access.

## 16.4 Data Security

Requirements:

- Encryption in transit.
- Encryption at rest.
- Secure secret storage.
- User data isolation.
- Backup and recovery.
- Data export.
- User-controlled deletion.
- External integration authorization management.

## 16.5 AI Security

The system should defend against:

- Prompt injection.
- Malicious external documents.
- Tool abuse.
- Unauthorized data access.
- Excessive Agent execution.
- Untrusted Plugin output.

External knowledge sources and Plugin outputs must be treated as data, not privileged system instructions.

---

# 17. Reliability and Observability

Agent systems are more difficult to debug than traditional request-response applications.

The platform should provide execution-level observability.

## 17.1 Logging

Record:

- User requests.
- Agent execution IDs.
- Planning decisions.
- Plugin execution.
- Tool calls.
- Model provider.
- Model latency.
- Token consumption.
- Errors.
- Retries.
- Final results.

Sensitive content should be subject to configurable logging and retention policies.

## 17.2 Metrics

Recommended metrics:

- Agent task success rate.
- Agent execution duration.
- Plugin execution failure rate.
- LLM latency.
- Token consumption.
- Assessment completion rate.
- Assessment evaluation reliability.
- Blindspot confirmation rate.
- Mastery verification rate.
- Knowledge retention rate.

## 17.3 Failure Recovery

The Agent Runtime should support:

- Persistent execution state.
- Checkpoint recovery.
- Idempotent operations.
- Retry policies.
- Task timeouts.
- Cancellation.
- Dead-letter queues.
- Human approval for sensitive actions.

Long-running tasks should not depend on a single uninterrupted model session.

## 17.4 AI Evaluation

The platform should maintain an internal evaluation framework for:

- Assessment question quality.
- Evaluation consistency.
- Blindspot detection precision.
- Teaching effectiveness.
- Context retrieval quality.
- Agent planning quality.
- Plugin reliability.

The system should distinguish between model confidence and objectively verified correctness.

---

# 18. Notifications and Scheduling

Mastery OS should support proactive learning.

Examples:

- A concept is due for review.
- A previously mastered concept may need reassessment.
- A prerequisite gap is blocking current learning.
- A learning milestone has been reached.
- A research task has completed.
- An Agent requires user approval.

Scheduling should support:

- One-time tasks.
- Recurring reviews.
- Adaptive review intervals.
- User-configurable notifications.
- Quiet hours.
- Cross-device synchronization.

Review scheduling should be based on evidence, performance, and retention risk rather than fixed repetition alone.

---

# 19. Cross-Platform Strategy

The product should provide a consistent experience across:

- Web.
- Desktop.
- iOS.
- Android.

## 19.1 Web

Primary application interface.

Suitable for:

- Workspace management.
- Learning dashboards.
- Research.
- Concept exploration.
- Agent monitoring.

## 19.2 Desktop

Suitable for:

- Local file integration.
- Document ingestion.
- Development and coding exercises.
- Deep research workflows.
- External application integrations.

## 19.3 Mobile

Suitable for:

- Quick learning sessions.
- Flashcards and recall exercises.
- Notifications.
- Voice-based learning.
- Reviewing mastery status.
- Conversational interaction.

All clients should share the same backend and persistent mastery model.

---

# 20. Performance and Scalability

Initial architecture should prioritize simplicity and reliability.

Recommended approach:

- Start with a modular monolith.
- Use asynchronous workers for long-running tasks.
- Separate Agent execution from normal API requests.
- Store large outputs outside the relational database.
- Use caching for frequently accessed Workspace and Concept data.
- Introduce dedicated search infrastructure when required.

Potential future scaling boundaries:

- Agent Execution Service.
- Document Processing Service.
- Assessment Service.
- Search and Retrieval Service.
- Notification Service.

These should be extracted only when operational requirements justify the additional complexity.

---

# 21. MVP Scope

The initial product should validate its central hypothesis:

**Can AI reliably identify what a user does not know, help the user learn it, and verify actual mastery?**

The MVP should focus on this experience rather than building a complete ecosystem.

## 21.1 MVP Features

### Workspace

- Create Workspace.
- Configure learning domain.
- Create learning objectives.
- Workspace SuperAgent.
- Basic Project management.

### Concept Management

- Create and discover Concepts.
- Define prerequisites.
- Build basic dependency relationships.
- Define learning objectives.

### Mastery Core

- Five assessment dimensions.
- Assessment criteria.
- Initial diagnosis.
- Evidence storage.
- Mastery states.
- Basic mastery dashboard.

### Assessment

- AI-generated questions.
- Open-ended responses.
- Rubric-based evaluation.
- Basic adaptive assessment.
- Independent verification.

### Blindspot Detection

- Identify incorrect answers.
- Generate root-cause hypotheses.
- Ask follow-up diagnostic questions.
- Record confirmed knowledge gaps.

### Teaching

- Personalized explanations.
- Examples.
- Guided exercises.
- Follow-up assessment.

### Agent System

- Workspace SuperAgent.
- Teacher Agent.
- Assessment Agent.
- Evaluator Agent.
- Basic task orchestration.

### Context

- Global Context.
- Workspace Context.
- Agent execution context.
- Persistent learning history.

### Interface

- Workspace navigation.
- SuperAgent chat.
- Concept detail.
- Mastery dashboard.
- Assessment interface.
- Agent execution status.

## 21.2 Features to Defer

The following are valuable but should not block the MVP:

- Full Plugin Marketplace.
- Third-party Plugin development platform.
- Complex multi-Agent collaboration.
- Advanced knowledge graph visualization.
- Full Obsidian and Notion bidirectional synchronization.
- Advanced research pipelines.
- Collaborative Workspaces.
- Community learning.
- Advanced mobile offline support.
- Fully autonomous background Agents.

## 21.3 MVP Success Criteria

The MVP should be evaluated using measurable product outcomes.

Suggested metrics:

| Metric | What It Measures |
|---|---|
| Blindspot Detection Precision | Whether identified gaps are genuine |
| Assessment Reliability | Whether evaluation results are consistent |
| Mastery Verification Success | Whether users can independently demonstrate mastery |
| Learning Improvement | Whether performance improves after intervention |
| Retention Performance | Whether knowledge is retained over time |
| User Trust | Whether users trust and understand mastery decisions |
| Learning Efficiency | Whether targeted intervention reduces unnecessary learning |

The most important success criterion is not the number of generated lessons.

It is whether the system can accurately identify knowledge gaps and produce measurable improvements in the user's ability.

---

# 22. Development Roadmap

## Phase 1: Core Foundation

Build:

- Authentication.
- Workspace.
- Project.
- Concept Registry.
- Concept Dependencies.
- Basic database model.
- SuperAgent interface.
- Basic Agent Runtime.

Deliverable:

A user can create a Workspace and describe a learning objective.

## Phase 2: Mastery Core

Build:

- Learning Objectives.
- Assessment Criteria.
- Assessment Sessions.
- Evidence Storage.
- Mastery Records.
- Mastery Dashboard.

Deliverable:

The system can assess a user's knowledge and maintain structured mastery records.

## Phase 3: Blindspot Detection

Build:

- Adaptive Assessment.
- Root-Cause Analysis.
- Prerequisite Validation.
- Blindspot Records.
- Targeted Diagnostic Questions.

Deliverable:

The system can identify why a user does not understand a concept.

## Phase 4: Personalized Teaching

Build:

- Teacher Agent.
- Learning Interventions.
- Adaptive Explanations.
- Practical Exercises.
- Independent Verification.

Deliverable:

The system can identify a gap, teach the user, and verify improvement.

## Phase 5: Continuous Mastery

Build:

- Retention Monitoring.
- Review Scheduling.
- Historical Performance.
- Mastery State Recalculation.
- Proactive Notifications.

Deliverable:

The system can maintain mastery records over long periods.

## Phase 6: Plugin Ecosystem

Build:

- Plugin Runtime.
- Plugin Manifest.
- Permission System.
- Plugin Installation.
- Plugin Lifecycle.
- Plugin SDK.
- Plugin Marketplace.

Deliverable:

Third-party developers can extend learning and assessment capabilities.

## Phase 7: External Integrations and Cross-Platform Expansion

Build:

- Obsidian Integration.
- Notion Integration.
- PDF and Document Ingestion.
- Web Research Integration.
- Desktop Application.
- Mobile Application.

Deliverable:

Mastery OS becomes a cross-platform personal learning environment.

---

# 23. Key Product Decisions

The following decisions represent the current product direction.

| Area | Current Direction |
|---|---|
| Product Positioning | Mastery OS, not a note-taking application |
| Core Entity | Concept |
| Core Engine | Mastery Core |
| Primary Interface | Workspace-first + Agent-centric |
| Main AI Entry Point | Workspace SuperAgent |
| Agent Management | Automatically coordinated by SuperAgent |
| Mastery Evaluation | Evidence-based |
| Assessment Dimensions | Recall, Understanding, Reasoning, Application, Transfer |
| Knowledge Storage | External sources and optional internal indexing |
| Context Architecture | Global / Workspace / Agent |
| Extensibility | Plugin-based |
| Core State Management | Platform-owned |
| Learning Strategy | Structured + Adaptive + Exploration |
| Execution Model | Persistent, asynchronous Agent Runtime |
| Initial Architecture | Modular monolith |
| Initial Product Focus | Blindspot Detection and Verified Mastery |

---

# 24. Open Technical and Product Questions

These topics require further design before implementation.

## Product Questions

1. Should a Concept be globally reusable across Workspaces, or should each Workspace maintain independent Concept instances with optional shared identities?
2. How should the system handle competing or contradictory definitions from different sources?
3. Should users be able to manually edit assessment criteria?
4. How much control should users have over SuperAgent planning?
5. Should mastery states be shared across Projects?
6. How should collaborative learning work in the future?

## Assessment Questions

1. How should mastery scores be calculated?
2. How should confidence be calibrated?
3. How many independent assessments are required for Mastered status?
4. How should different assessment methods contribute to the same criteria?
5. How should the system distinguish genuine understanding from memorization?
6. How should domain-specific verification systems be integrated?

## Agent Questions

1. Should the Agent Runtime be implemented with a framework or as a custom execution engine?
2. How should multi-Agent task dependencies be represented?
3. How should Agent memory be consolidated?
4. How should task recovery work after process failure?
5. What level of Agent activity should be visible to users?

## Plugin Questions

1. Should Plugins run in isolated containers or a managed execution environment?
2. Should Plugins support third-party Agents?
3. How should Plugin version compatibility work?
4. Should Plugins be installable at Workspace or global level?
5. What permission model should external Plugins use?

## Infrastructure Questions

1. Which LLM providers should be supported initially?
2. Should the initial deployment be cloud-only?
3. How should local document processing work?
4. What are the expected data retention requirements?
5. When should dedicated vector and search infrastructure be introduced?

---

# 25. Final Architecture Principles

Mastery OS should be built around a few fundamental boundaries.

**1. Mastery Core owns truth about mastery.**

Agents and Plugins can produce evidence, but only Mastery Core determines and maintains the official mastery state.

**2. Concept is the fundamental knowledge unit.**

The system should organize learning around assessable concepts rather than documents, notes, or chat sessions.

**3. SuperAgent coordinates; it does not own everything.**

It plans and delegates work while domain systems maintain their own authoritative data.

**4. Context is not the same as model context.**

Persistent storage, retrieval, and model context injection must remain separate.

**5. Plugins extend capabilities, not core business ownership.**

Plugins can provide teaching, assessment, research, and specialized execution without fragmenting the user's mastery records.

**6. Assessment must be independent of teaching.**

The system must verify actual capabilities rather than treating course completion or user confirmation as proof.

**7. Mastery is continuously updated.**

A user's knowledge state is dynamic and must evolve with new assessment evidence.

---

# Conclusion

Mastery OS is intended to become a personal operating system for learning and intellectual development.

Its central value is not storing everything a user has learned.

It is building a reliable understanding of what the user actually knows, identifying what is missing, and continuously helping the user improve.

The fundamental product loop is:

**Discover → Model → Assess → Diagnose → Teach → Verify → Monitor**

The Workspace provides the environment.

The SuperAgent coordinates the work.

The Agent and Plugin ecosystem provides specialized capabilities.

The Context System preserves continuity.

The Mastery Core maintains the user's evolving knowledge state.

Together, these systems form an extensible AI-powered platform for long-term learning, research, and knowledge mastery.