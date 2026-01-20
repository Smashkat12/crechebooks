<task_spec id="TASK-PERF-104" version="1.0">

<metadata>
  <title>Database Connection Pool Monitoring</title>
  <status>ready</status>
  <phase>usacf-sprint-2</phase>
  <layer>infrastructure</layer>
  <sequence>206</sequence>
  <priority>P1-HIGH</priority>
  <sprint>2</sprint>
  <estimated_effort>3 days (24 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP015</opportunity_ref>
    <gap_ref>P007</gap_ref>
    <fmea_ref>FM002</fmea_ref>
  </implements>
  <depends_on>
    <!-- No strict dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>90%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP015</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
    Connection pool exhaustion causes complete system outage - monitoring is critical.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15 (pool managed by Prisma)</orm>
    <monitoring>Prometheus metrics format, Grafana dashboards</monitoring>
    <health>@nestjs/terminus for health checks</health>
    <testing>Jest for unit/integration, no mock data - use real database</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/           - NestJS API (this task's primary target)
    apps/web/           - React frontend
    infrastructure/     - Grafana/Prometheus configs (create if needed)
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - verify metrics against real pool behavior</rule>
    <rule id="3">ROBUST ERROR LOGGING - pool exhaustion warnings before critical</rule>
    <rule id="4">LOW OVERHEAD - metrics collection must add less than 1ms latency</rule>
    <rule id="5">ALERTING - critical alerts must fire within 30 seconds of threshold breach</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="health">Health indicators in apps/api/src/health/</pattern>
    <pattern name="metrics">Prometheus format at /metrics endpoint</pattern>
    <pattern name="module">Monitoring module at apps/api/src/database/monitoring/</pattern>
  </coding_patterns>

  <existing_database_structure>
    - Prisma service at apps/api/src/database/prisma/prisma.service.ts
    - Health module at apps/api/src/health/health.module.ts
    - Currently NO pool monitoring (this task adds it)
  </existing_database_structure>
</project_context>

<executive_summary>
Implement comprehensive monitoring for database connection pool to prevent exhaustion and
enable proactive scaling. Currently, no visibility into pool utilization - issues only
discovered on timeout. Monitoring will provide metrics, alerts, and Grafana dashboard.
</executive_summary>

<business_case>
  <problem>No connection pool monitoring - issues discovered only on failure</problem>
  <solution>Real-time monitoring, metrics, and alerting</solution>
  <benefit>Prevent outages, enable proactive scaling</benefit>
  <roi>Incident avoidance, reduced MTTR</roi>
</business_case>

<context>
FMEA FM002: Database Connection Pool Exhaustion
- Severity: 10 (Complete system outage)
- Occurrence: 4 (Monthly invoice peaks)
- Detection: 7 (No monitoring, only visible on timeout)
- RPN: 280 (CRITICAL)

Current State:
- Prisma default pool settings
- No pool size optimization
- No utilization metrics
- No alerting on high usage
</context>

<input_context_files>
  <file purpose="prisma_service">apps/api/src/database/prisma/prisma.service.ts</file>
  <file purpose="app_module">apps/api/src/app.module.ts</file>
  <file purpose="usacf_risk_analysis">docs/usacf-analysis/03-risk-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Connection pool metrics collection
    - Prometheus metrics endpoint
    - Grafana dashboard configuration
    - Alert rules for high utilization
    - Health check integration
    - Query performance tracking
    - Pool configuration optimization
  </in_scope>
  <out_of_scope>
    - Automatic pool scaling (future enhancement)
    - Query-level APM (separate tool)
    - Multi-database support
    - Read replica routing
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/monitoring/pool-metrics.service.ts">
      @Injectable()
      export class PoolMetricsService {
        constructor(private prisma: PrismaService);

        async getMetrics(): Promise&lt;PoolMetrics&gt;;
        async getHistoricalMetrics(range: string): Promise&lt;PoolMetrics[]&gt;;

        // Prometheus-compatible metrics
        getPrometheusMetrics(): string;
      }

      interface PoolMetrics {
        activeConnections: number;
        idleConnections: number;
        totalConnections: number;
        waitingRequests: number;
        maxConnections: number;
        utilizationPercent: number;
        avgQueryTime: number;
        slowQueries: number;
      }
    </signature>
    <signature file="apps/api/src/database/monitoring/pool-health.indicator.ts">
      @Injectable()
      export class PoolHealthIndicator extends HealthIndicator {
        async isHealthy(): Promise&lt;HealthIndicatorResult&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Metrics collection overhead &lt;1ms per request
    - Alert threshold: 80% pool utilization
    - Critical threshold: 95% pool utilization
    - Metrics retention: 7 days
    - Dashboard refresh: 10 seconds
  </constraints>

  <verification>
    - Metrics endpoint returns accurate pool stats
    - Grafana dashboard displays real-time data
    - Alerts fire at threshold breach
    - Health check reflects pool status
    - No performance impact from monitoring
  </verification>
</definition_of_done>

<metrics_specification>
  <metric name="prisma_pool_active_connections" type="gauge">
    Number of active database connections
  </metric>
  <metric name="prisma_pool_idle_connections" type="gauge">
    Number of idle connections in pool
  </metric>
  <metric name="prisma_pool_waiting_requests" type="gauge">
    Requests waiting for connection
  </metric>
  <metric name="prisma_pool_utilization_percent" type="gauge">
    Current pool utilization percentage
  </metric>
  <metric name="prisma_query_duration_seconds" type="histogram">
    Query execution time distribution
  </metric>
  <metric name="prisma_slow_queries_total" type="counter">
    Count of queries exceeding 100ms
  </metric>
</metrics_specification>

<files_to_create>
  <file path="apps/api/src/database/monitoring/pool-metrics.service.ts">
    Connection pool metrics collection
  </file>
  <file path="apps/api/src/database/monitoring/pool-health.indicator.ts">
    Health indicator for pool status
  </file>
  <file path="apps/api/src/database/monitoring/monitoring.module.ts">
    Monitoring module
  </file>
  <file path="apps/api/src/metrics/metrics.controller.ts">
    Prometheus metrics endpoint
  </file>
  <file path="infrastructure/grafana/dashboards/database-pool.json">
    Grafana dashboard configuration
  </file>
  <file path="infrastructure/prometheus/alerts/database.yml">
    Prometheus alert rules
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/prisma/prisma.service.ts">
    Add metrics middleware
  </file>
  <file path="apps/api/src/health/health.module.ts">
    Add pool health indicator
  </file>
  <file path="apps/api/src/app.module.ts">
    Import monitoring module
  </file>
</files_to_modify>

<alert_rules>
  <rule name="DatabasePoolHighUtilization" severity="warning">
    Pool utilization > 80% for 5 minutes
  </rule>
  <rule name="DatabasePoolCritical" severity="critical">
    Pool utilization > 95% for 1 minute
  </rule>
  <rule name="DatabaseSlowQueries" severity="warning">
    Slow queries > 10/minute
  </rule>
  <rule name="DatabaseConnectionWaiting" severity="warning">
    Waiting requests > 0 for 30 seconds
  </rule>
</alert_rules>

<validation_criteria>
  <criterion>Metrics endpoint returns pool statistics</criterion>
  <criterion>Grafana dashboard displays real-time metrics</criterion>
  <criterion>Alerts fire at configured thresholds</criterion>
  <criterion>Health check reflects pool health</criterion>
  <criterion>Metrics collection overhead &lt;1ms</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="pool-metrics" --verbose</command>
  <command>curl http://localhost:3000/metrics</command>
</test_commands>

<success_metrics>
  <metric name="detection_time">&lt;30 seconds (from never)</metric>
  <metric name="mttr_improvement">50% reduction</metric>
  <metric name="monitoring_overhead">&lt;1ms per request</metric>
</success_metrics>

<rollback_plan>
  - Monitoring is additive, no rollback needed
  - Disable by removing MonitoringModule from imports
  - No database changes
</rollback_plan>

</task_spec>
