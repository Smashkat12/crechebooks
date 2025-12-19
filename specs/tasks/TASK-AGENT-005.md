<task_spec id="TASK-AGENT-005" version="1.0">

<metadata>
  <title>Orchestrator Agent Setup</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>41</sequence>
  <implements>
    <requirement_ref>NFR-PERF-001</requirement_ref>
    <requirement_ref>NFR-SCALE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-AGENT-002</task_ref>
    <task_ref>TASK-AGENT-003</task_ref>
    <task_ref>TASK-AGENT-004</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task implements the Orchestrator agent, the main Claude Code session that coordinates
all specialized subagents (Transaction Categorizer, Payment Matcher, SARS Agent). The
orchestrator runs as the primary session, spawns task-based subagents using the Task tool,
manages workflow state, handles escalations, and ensures session persistence. It acts as
the central coordinator for all AI-powered bookkeeping operations, routing work to the
appropriate specialized agents and aggregating results for the API layer.
</context>

<input_context_files>
  <file purpose="orchestrator_definition">specs/technical/architecture.md#orchestrator_pattern</file>
  <file purpose="agent_definitions">specs/technical/architecture.md#agent_definitions</file>
  <file purpose="workflow_patterns">specs/constitution.md#workflow_coordination</file>
  <file purpose="autonomy_levels">specs/constitution.md#autonomy_levels</file>
</input_context_files>

<prerequisites>
  <check>TASK-AGENT-001 completed (.claude/ infrastructure exists)</check>
  <check>TASK-AGENT-002 completed (Transaction Categorizer implemented)</check>
  <check>TASK-AGENT-003 completed (Payment Matcher implemented)</check>
  <check>TASK-AGENT-004 completed (SARS Agent implemented)</check>
  <check>All MCP servers configured and accessible</check>
</prerequisites>

<scope>
  <in_scope>
    - Create orchestrator in src/agents/orchestrator/
    - Implement task spawning using Claude Code Task tool
    - Agent routing logic:
      - Route transactions to Categorizer
      - Route payments to Matcher
      - Route SARS calculations to SARS Agent
    - Workflow management:
      - Sequential task execution
      - Parallel task execution where appropriate
      - Dependency resolution
    - Session persistence:
      - Save workflow state
      - Resume interrupted workflows
      - Track task progress
    - Escalation handling:
      - Aggregate escalations from subagents
      - Store in .claude/logs/escalations.jsonl
      - Notify user via AskUserQuestion when appropriate
    - Result aggregation and reporting
    - Error handling and retry logic
  </in_scope>
  <out_of_scope>
    - Subagent implementations (already completed)
    - API layer integration (TASK-API-*)
    - User interface (Phase 4)
    - Background job queue (handled by NestJS Bull)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/agents/orchestrator/orchestrator.agent.ts">
      export class OrchestratorAgent {
        async processTransactions(
          transactions: Transaction[],
          context: OrchestratorContext
        ): Promise&lt;TransactionProcessingResult&gt;;

        async processPayments(
          payments: Payment[],
          context: OrchestratorContext
        ): Promise&lt;PaymentProcessingResult&gt;;

        async calculateSARS(
          period: TaxPeriod,
          context: OrchestratorContext
        ): Promise&lt;SARSCalculationResult&gt;;

        private spawnSubagent(
          agentType: AgentType,
          task: string,
          context: any
        ): Promise&lt;TaskResult&gt;;

        private handleEscalation(
          escalation: Escalation
        ): Promise&lt;void&gt;;

        private saveWorkflowState(
          workflowId: string,
          state: WorkflowState
        ): Promise&lt;void&gt;;

        private resumeWorkflow(
          workflowId: string
        ): Promise&lt;WorkflowState&gt;;
      }
    </signature>
    <signature file=".claude/agents/orchestrator/orchestrator.md">
      # Orchestrator Agent

      ## Role
      Coordinate all specialized subagents and manage workflows

      ## Subagents
      - Transaction Categorizer (transaction-categorizer)
      - Payment Matcher (payment-matcher)
      - SARS Agent (sars-agent)

      ## Workflows
      1. Transaction Processing:
         - Spawn Categorizer for each batch
         - Aggregate results
         - Handle escalations

      2. Payment Processing:
         - Spawn Matcher for each batch
         - Aggregate results
         - Handle escalations

      3. SARS Calculation:
         - Spawn SARS Agent
         - Always escalate for review

      ## Task Tool Usage
      Use Claude Code Task tool to spawn subagents with specific context
    </signature>
    <signature file="src/agents/orchestrator/workflow-manager.ts">
      export class WorkflowManager {
        async createWorkflow(
          type: WorkflowType,
          params: WorkflowParams
        ): Promise&lt;Workflow&gt;;

        async executeWorkflow(
          workflow: Workflow
        ): Promise&lt;WorkflowResult&gt;;

        async pauseWorkflow(
          workflowId: string
        ): Promise&lt;void&gt;;

        async resumeWorkflow(
          workflowId: string
        ): Promise&lt;WorkflowResult&gt;;

        private persistState(
          workflow: Workflow
        ): Promise&lt;void&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Claude Code Task tool for all subagent spawning
    - Must aggregate all subagent escalations
    - Must persist workflow state for resume capability
    - Must implement retry logic for transient failures
    - Must NOT duplicate subagent logic (delegate to specialists)
    - Must log all orchestration decisions
    - Must handle concurrent workflows per tenant
    - Escalations must be tenant-scoped
  </constraints>

  <verification>
    - Orchestrator successfully spawns Transaction Categorizer
    - Orchestrator successfully spawns Payment Matcher
    - Orchestrator successfully spawns SARS Agent
    - Workflow state persists and can be resumed
    - Escalations aggregated from all subagents
    - Parallel task execution works correctly
    - Error handling and retry logic functional
    - Session persistence across orchestrator restarts
  </verification>
</definition_of_done>

<pseudo_code>
Orchestrator Structure:
  src/agents/orchestrator/
    orchestrator.agent.ts       # Main orchestrator
    workflow-manager.ts         # Workflow state management
    agent-spawner.ts            # Task tool wrapper
    escalation-aggregator.ts    # Aggregate subagent escalations
    session-persister.ts        # Session state persistence
    orchestrator.module.ts      # NestJS module
    orchestrator.service.ts     # Service for API layer

Transaction Processing Workflow:
  async function processTransactions(transactions, context):
    # 1. Create workflow
    workflow = await workflowManager.createWorkflow({
      type: 'transaction_categorization',
      tenantId: context.tenantId,
      transactionIds: transactions.map(t => t.id)
    })

    # 2. Split into batches (50 per batch)
    batches = chunkArray(transactions, 50)

    # 3. Process batches (can be parallel or sequential)
    allResults = []
    allEscalations = []

    for batch in batches:
      # Spawn Categorizer subagent using Task tool
      result = await spawnSubagent({
        agentType: 'transaction-categorizer',
        task: `Categorize ${batch.length} transactions`,
        context: {
          transactions: batch,
          patterns: await loadPatterns(),
          chartOfAccounts: await loadChartOfAccounts(),
          tenantId: context.tenantId
        }
      })

      allResults.push(...result.categorizations)
      allEscalations.push(...result.escalations)

      # Update workflow progress
      await workflowManager.updateProgress(workflow.id, {
        processedCount: allResults.length,
        totalCount: transactions.length
      })

      # Persist state
      await sessionPersister.saveState(workflow.id, {
        results: allResults,
        escalations: allEscalations,
        lastProcessedBatch: batch[batch.length - 1].id
      })

    # 4. Aggregate escalations
    if allEscalations.length > 0:
      await escalationAggregator.storeEscalations(
        context.tenantId,
        allEscalations
      )

    # 5. Complete workflow
    await workflowManager.completeWorkflow(workflow.id, {
      success: true,
      processedCount: allResults.length,
      escalationCount: allEscalations.length
    })

    return {
      workflowId: workflow.id,
      results: allResults,
      escalations: allEscalations,
      summary: {
        total: transactions.length,
        categorized: allResults.filter(r => r.autoApplied).length,
        escalated: allEscalations.length
      }
    }

Payment Processing Workflow:
  async function processPayments(payments, context):
    # Similar structure to transaction processing
    workflow = await workflowManager.createWorkflow({
      type: 'payment_matching',
      tenantId: context.tenantId,
      paymentIds: payments.map(p => p.id)
    })

    allResults = []
    allEscalations = []

    for payment in payments:
      # Spawn Payment Matcher subagent
      result = await spawnSubagent({
        agentType: 'payment-matcher',
        task: `Match payment ${payment.id} to invoices`,
        context: {
          payment: payment,
          tenantId: context.tenantId
        }
      })

      allResults.push(result.match)
      if result.escalation:
        allEscalations.push(result.escalation)

      await workflowManager.updateProgress(workflow.id, {
        processedCount: allResults.length,
        totalCount: payments.length
      })

    # Store escalations
    if allEscalations.length > 0:
      await escalationAggregator.storeEscalations(
        context.tenantId,
        allEscalations
      )

    await workflowManager.completeWorkflow(workflow.id, {
      success: true,
      processedCount: allResults.length,
      escalationCount: allEscalations.length
    })

    return {
      workflowId: workflow.id,
      results: allResults,
      escalations: allEscalations,
      summary: {
        total: payments.length,
        matched: allResults.filter(r => r.autoApplied).length,
        escalated: allEscalations.length
      }
    }

SARS Calculation Workflow:
  async function calculateSARS(period, context):
    workflow = await workflowManager.createWorkflow({
      type: 'sars_calculation',
      tenantId: context.tenantId,
      period: period
    })

    # Spawn SARS Agent (ALWAYS requires review)
    result = await spawnSubagent({
      agentType: 'sars-agent',
      task: `Calculate SARS returns for ${period}`,
      context: {
        period: period,
        tenantId: context.tenantId
      }
    })

    # SARS calculations ALWAYS escalated for review
    escalation = {
      type: 'sars_calculation',
      period: period,
      payeCalculation: result.paye,
      uifCalculation: result.uif,
      vatCalculation: result.vat,
      uncertainties: result.uncertainties,
      requiresReview: true
    }

    await escalationAggregator.storeEscalations(
      context.tenantId,
      [escalation]
    )

    await workflowManager.completeWorkflow(workflow.id, {
      success: true,
      requiresReview: true
    })

    return {
      workflowId: workflow.id,
      emp201: result.emp201,
      vat201: result.vat201,
      escalation: escalation,
      requiresReview: true
    }

Spawn Subagent (using Task Tool):
  async function spawnSubagent(params):
    # Use Claude Code Task tool to spawn subagent
    # This is a conceptual wrapper - actual implementation
    # would invoke the Task tool from the orchestrator session

    taskPrompt = buildTaskPrompt(params.agentType, params.task, params.context)

    # Invoke Task tool (pseudo-code)
    taskResult = await ClaudeCode.Task({
      prompt: taskPrompt,
      context: params.context
    })

    # Parse and return structured result
    return parseTaskResult(taskResult)

Task Prompt Builder:
  function buildTaskPrompt(agentType, task, context):
    switch agentType:
      case 'transaction-categorizer':
        return `
          You are the Transaction Categorizer agent.

          Task: ${task}

          Context:
          - Transactions: ${JSON.stringify(context.transactions)}
          - Patterns: Load from .claude/context/payee_patterns.json
          - Chart of Accounts: Load from .claude/context/chart_of_accounts.json
          - Tenant ID: ${context.tenantId}

          Instructions:
          1. Categorize each transaction using pattern matching
          2. Calculate confidence scores
          3. Auto-apply categorizations with confidence >= 80%
          4. Escalate low-confidence categorizations
          5. Log all decisions to .claude/logs/decisions.jsonl

          Return JSON result with categorizations and escalations.
        `

      case 'payment-matcher':
        return `
          You are the Payment Matcher agent.

          Task: ${task}

          Context:
          - Payment: ${JSON.stringify(context.payment)}
          - Tenant ID: ${context.tenantId}

          Instructions:
          1. Load outstanding invoices via mcp__xero__get_invoices
          2. Apply matching strategies (reference, amount, name)
          3. Calculate confidence scores
          4. Auto-apply matches with confidence >= 90%
          5. Escalate ambiguous matches
          6. Log all decisions to .claude/logs/decisions.jsonl

          Return JSON result with match details and escalation if needed.
        `

      case 'sars-agent':
        return `
          You are the SARS Calculation agent.

          Task: ${task}

          Context:
          - Tax Period: ${JSON.stringify(context.period)}
          - Tenant ID: ${context.tenantId}

          Instructions:
          1. Load 2025 SARS tax tables from .claude/context/sars_tables_2025.json
          2. Calculate PAYE using tax brackets and rebates
          3. Calculate UIF (1% employee + 1% employer, capped at R177.12/month)
          4. Calculate VAT (15% rate)
          5. Generate EMP201 and VAT201 draft returns
          6. Flag ALL uncertainties
          7. ALWAYS require human review (L2 autonomy)

          Return JSON result with calculations, drafts, and uncertainties.
          requiresReview MUST be true.
        `

Workflow State Persistence:
  async function saveWorkflowState(workflowId, state):
    # Store in database or Redis
    await db.workflow_state.upsert({
      where: { id: workflowId },
      create: {
        id: workflowId,
        state: JSON.stringify(state),
        lastUpdated: new Date()
      },
      update: {
        state: JSON.stringify(state),
        lastUpdated: new Date()
      }
    })

    # Also append to decisions log
    await appendToFile('.claude/logs/decisions.jsonl', JSON.stringify({
      timestamp: new Date().toISOString(),
      agent: 'orchestrator',
      action: 'workflow_state_saved',
      workflowId: workflowId,
      state: state
    }) + '\n')

  async function resumeWorkflow(workflowId):
    # Load from database
    record = await db.workflow_state.findUnique({
      where: { id: workflowId }
    })

    if not record:
      throw new Error(`Workflow ${workflowId} not found`)

    return JSON.parse(record.state)

Escalation Aggregator:
  async function storeEscalations(tenantId, escalations):
    for escalation in escalations:
      # Store in database
      await db.escalation.create({
        data: {
          tenantId: tenantId,
          type: escalation.type,
          details: JSON.stringify(escalation),
          status: 'pending',
          createdAt: new Date()
        }
      })

      # Append to escalations log
      await appendToFile('.claude/logs/escalations.jsonl', JSON.stringify({
        timestamp: new Date().toISOString(),
        tenantId: tenantId,
        escalation: escalation
      }) + '\n')
</pseudo_code>

<files_to_create>
  <file path="src/agents/orchestrator/orchestrator.agent.ts">Main orchestrator agent class</file>
  <file path="src/agents/orchestrator/workflow-manager.ts">Workflow state management</file>
  <file path="src/agents/orchestrator/agent-spawner.ts">Task tool wrapper for spawning subagents</file>
  <file path="src/agents/orchestrator/escalation-aggregator.ts">Aggregate and store escalations</file>
  <file path="src/agents/orchestrator/session-persister.ts">Session state persistence</file>
  <file path="src/agents/orchestrator/task-prompt-builder.ts">Build prompts for subagent tasks</file>
  <file path="src/agents/orchestrator/orchestrator.module.ts">NestJS module definition</file>
  <file path="src/agents/orchestrator/orchestrator.service.ts">Service layer for API integration</file>
  <file path=".claude/agents/orchestrator/orchestrator.md">Orchestrator documentation</file>
  <file path="src/agents/orchestrator/interfaces/orchestrator.interface.ts">TypeScript interfaces</file>
  <file path="tests/agents/orchestrator/orchestrator.spec.ts">Unit tests</file>
  <file path="tests/agents/orchestrator/workflow-manager.spec.ts">Workflow manager tests</file>
  <file path="tests/agents/orchestrator/integration.spec.ts">Integration tests with subagents</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">
    Import OrchestratorModule
  </file>
  <file path="prisma/schema.prisma">
    Add models:
    - WorkflowState (id, tenantId, state, lastUpdated)
    - Escalation (id, tenantId, type, details, status, createdAt, resolvedAt)
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Orchestrator successfully spawns Transaction Categorizer using Task tool</criterion>
  <criterion>Orchestrator successfully spawns Payment Matcher using Task tool</criterion>
  <criterion>Orchestrator successfully spawns SARS Agent using Task tool</criterion>
  <criterion>Workflow state persists to database and can be resumed</criterion>
  <criterion>Escalations from all subagents aggregated correctly</criterion>
  <criterion>Parallel workflow execution works for multiple tenants</criterion>
  <criterion>Error handling and retry logic prevents data loss</criterion>
  <criterion>Session persistence allows recovery from orchestrator restarts</criterion>
  <criterion>Integration tests verify end-to-end workflows</criterion>
  <criterion>Unit tests achieve >85% code coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- orchestrator</command>
  <command>npm run test:e2e -- agents/orchestrator</command>
  <command>npm run lint</command>
  <command>npm run build</command>
  <command>npm run test:integration -- workflows</command>
</test_commands>

</task_spec>
