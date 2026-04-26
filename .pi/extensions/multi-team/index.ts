/**
 * Multi-Team Agent Extension
 *
 * Implements IndyDevDan's three-tier multi-team architecture on top of PI:
 *   user -> orchestrator -> leads -> workers
 *
 * - Loads .pi/multi-team/multi-team-config.yaml at extension init.
 * - Discovers agents in .pi/multi-team/agents/.
 * - Registers a `delegate` tool that spawns a one-shot `pi -p` subprocess
 *   for the target agent, with the target's full system prompt assembled
 *   from front-matter (body + inlined skills + expertise + runtime vars).
 * - Enforces strict-tree delegation by default
 *   (orchestrator -> leads, lead -> own workers).
 * - Appends every delegation request and response to a shared per-session
 *   conversation.jsonl that all agents read via the `active-listener` skill.
 *
 * Runtime identity:
 *   - Root pi process (interactive or print mode without env): runs as orchestrator.
 *   - Spawned subprocess: identifies itself via env MULTI_TEAM_AGENT_NAME.
 *   - All processes share the same session dir via env MULTI_TEAM_SESSION_DIR.
 */

import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ExtensionAPI,
	parseFrontmatter,
	stripFrontmatter,
	withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { parse as parseYaml } from "yaml";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkillRef {
	path: string;
	"use-when"?: string;
}

interface ExpertiseRef {
	path: string;
	"use-when"?: string;
	updatable?: boolean;
	"max-lines"?: number;
}

interface DomainRule {
	path: string;
	read: boolean;
	update: boolean;
	delete: boolean;
}

interface AgentFile {
	name: string;
	description: string;
	model?: string;
	tools?: string[];
	skills?: SkillRef[];
	expertise?: ExpertiseRef[];
	domain?: DomainRule[];
	body: string;
	filePath: string;
}

interface TeamConfig {
	"team-name": string;
	"team-color"?: string;
	lead: { name: string; path: string; color?: string };
	members: { name: string; path: string; color?: string; "consult-when"?: string }[];
}

interface MultiTeamConfig {
	orchestrator: { name: string; path: string; color?: string };
	paths: {
		agents: string;
		skills: string;
		expertise: string;
		sessions: string;
		logs: string;
	};
	shared_context?: string[];
	teams: TeamConfig[];
	delegation: "strict-tree" | "open-mesh";
	defaults?: {
		orchestrator_model?: string;
		lead_model?: string;
		worker_model?: string;
	};
	conversation_log?: { enabled: boolean; filename: string };
	max_parallel_delegations?: number;
	/** Session-wide cost circuit breaker. null/undefined disables. */
	max_session_cost_usd?: number | null;
}

// ─── Repo / config / agent discovery ────────────────────────────────────────

function findRepoRoot(startCwd: string): string | null {
	let dir = path.resolve(startCwd);
	while (true) {
		if (fs.existsSync(path.join(dir, ".pi", "multi-team", "multi-team-config.yaml"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function loadConfig(repoRoot: string): MultiTeamConfig {
	const cfgPath = path.join(repoRoot, ".pi", "multi-team", "multi-team-config.yaml");
	const raw = fs.readFileSync(cfgPath, "utf-8");
	const parsed = parseYaml(raw) as MultiTeamConfig;
	return parsed;
}

function loadAgents(repoRoot: string, agentsRel: string): Map<string, AgentFile> {
	const dir = path.resolve(repoRoot, agentsRel);
	const out = new Map<string, AgentFile>();
	if (!fs.existsSync(dir)) return out;

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const filePath = path.join(dir, entry.name);
		const content = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);

		const name = frontmatter.name as string | undefined;
		const description = frontmatter.description as string | undefined;
		if (!name || !description) continue;

		// `tools:` accepted as either YAML list or comma-separated string.
		let tools: string[] | undefined;
		const rawTools = frontmatter.tools;
		if (Array.isArray(rawTools)) {
			tools = rawTools.map((t) => String(t).trim()).filter(Boolean);
		} else if (typeof rawTools === "string") {
			tools = rawTools
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
		}

		out.set(name, {
			name,
			description,
			model: frontmatter.model as string | undefined,
			tools,
			skills: frontmatter.skills as SkillRef[] | undefined,
			expertise: frontmatter.expertise as ExpertiseRef[] | undefined,
			domain: frontmatter.domain as DomainRule[] | undefined,
			body,
			filePath,
		});
	}
	return out;
}

// ─── Permitted-target resolution ────────────────────────────────────────────

function getCallerRole(name: string, config: MultiTeamConfig): "orchestrator" | "lead" | "worker" | "unknown" {
	const orchestratorName = path.basename(config.orchestrator.path, ".md");
	if (name === orchestratorName) return "orchestrator";
	for (const team of config.teams) {
		const leadName = path.basename(team.lead.path, ".md");
		if (name === leadName) return "lead";
		for (const m of team.members) {
			const memberName = path.basename(m.path, ".md");
			if (name === memberName) return "worker";
		}
	}
	return "unknown";
}

function getPermittedTargets(callerName: string, config: MultiTeamConfig): string[] {
	if (config.delegation === "open-mesh") {
		// Anyone may call anyone (still excludes self)
		const all: string[] = [];
		for (const t of config.teams) {
			all.push(path.basename(t.lead.path, ".md"));
			for (const m of t.members) all.push(path.basename(m.path, ".md"));
		}
		return all.filter((n) => n !== callerName);
	}

	// strict-tree
	const role = getCallerRole(callerName, config);
	if (role === "orchestrator") {
		return config.teams.map((t) => path.basename(t.lead.path, ".md"));
	}
	if (role === "lead") {
		const myTeam = config.teams.find((t) => path.basename(t.lead.path, ".md") === callerName);
		if (!myTeam) return [];
		return myTeam.members.map((m) => path.basename(m.path, ".md"));
	}
	return []; // workers + unknown cannot delegate
}

// ─── System-prompt assembly ─────────────────────────────────────────────────

function readFileSafe(p: string): string {
	try {
		return fs.readFileSync(p, "utf-8");
	} catch {
		return "";
	}
}

function resolveAbsolute(repoRoot: string, p: string): string {
	if (path.isAbsolute(p)) return p;
	return path.resolve(repoRoot, p);
}

function buildRenderedSystemPrompt(
	agent: AgentFile,
	config: MultiTeamConfig,
	repoRoot: string,
	sessionDir: string,
	conversationLog: string,
	callerName: string,
): string {
	const sections: string[] = [];

	// Runtime context block — this is what active-listener / mental-model skills reference.
	sections.push(
		[
			"# Runtime context (injected at startup)",
			``,
			`- **AGENT_NAME:** ${agent.name}`,
			`- **CALLER:** ${callerName}`,
			`- **SESSION_DIR:** ${sessionDir}`,
			`- **CONVERSATION_LOG:** ${conversationLog}`,
			`- **REPO_ROOT:** ${repoRoot}`,
			``,
			"You are running as part of a multi-team agent system. The conversation log",
			"above is shared with the orchestrator, all other leads, and all workers.",
			"Read it first to see what's already been said this session.",
		].join("\n"),
	);

	// Inline each referenced skill body verbatim, with the use-when annotation
	// as a one-line note above each skill.
	if (agent.skills && agent.skills.length > 0) {
		const skillSections: string[] = ["# Skills"];
		for (const ref of agent.skills) {
			const absPath = resolveAbsolute(repoRoot, ref.path);
			const raw = readFileSafe(absPath);
			if (!raw) continue;
			// Skill files now carry YAML frontmatter (name/description/when-to-use) per
			// CONVENTION.md. Strip it before inlining — the agent only needs the body.
			const body = stripFrontmatter(raw);
			const useWhen = ref["use-when"] ? `> Use when: ${ref["use-when"]}` : "";
			skillSections.push(`## (${path.basename(ref.path, ".md")})`);
			if (useWhen) skillSections.push(useWhen);
			skillSections.push("");
			skillSections.push(body.trim());
		}
		sections.push(skillSections.join("\n\n"));
	}

	// Expertise: read each referenced YAML file and inline. If the file doesn't
	// exist yet, leave an empty placeholder the agent can later write to.
	if (agent.expertise && agent.expertise.length > 0) {
		const expertiseSections: string[] = ["# Expertise (your personal mental model)"];
		expertiseSections.push(
			"These files are yours. Read at task start. Update when you learn something.",
			"",
		);
		for (const ref of agent.expertise) {
			const absPath = resolveAbsolute(repoRoot, ref.path);
			const exists = fs.existsSync(absPath);
			expertiseSections.push(`## ${path.basename(ref.path)}`);
			if (ref["use-when"]) expertiseSections.push(`> ${ref["use-when"]}`);
			expertiseSections.push("");
			if (exists) {
				const body = readFileSafe(absPath);
				expertiseSections.push("```yaml");
				expertiseSections.push(body.trim());
				expertiseSections.push("```");
			} else {
				expertiseSections.push(`*(empty — file at \`${ref.path}\` does not yet exist; you may create it)*`);
			}
			expertiseSections.push("");
		}
		sections.push(expertiseSections.join("\n"));
	}

	// Shared project context (README.md, CLAUDE.md, etc).
	if (config.shared_context && config.shared_context.length > 0) {
		const ctx: string[] = ["# Shared project context"];
		for (const file of config.shared_context) {
			const absPath = resolveAbsolute(repoRoot, file);
			const body = readFileSafe(absPath);
			if (!body) continue;
			ctx.push(`## ${file}`, "", body.trim(), "");
		}
		if (ctx.length > 1) sections.push(ctx.join("\n"));
	}

	// Domain — informational only at this point. Phase 6 will wire enforcement
	// via the tool_call hook in the spawned subprocess.
	if (agent.domain && agent.domain.length > 0) {
		const domainLines = ["# Domain (your file access scope)"];
		domainLines.push("Stay within these paths. The harness enforces this:");
		for (const rule of agent.domain) {
			const flags = [
				rule.read ? "read" : "",
				rule.update ? "update" : "",
				rule.delete ? "delete" : "",
			]
				.filter(Boolean)
				.join("/");
			domainLines.push(`- \`${rule.path}\` — ${flags || "no access"}`);
		}
		sections.push(domainLines.join("\n"));
	}

	// Finally, the agent's own body (their declared purpose / instructions).
	sections.push(agent.body.trim());

	return sections.join("\n\n");
}

// ─── Conversation log ───────────────────────────────────────────────────────

interface LogEntry {
	ts: string;
	role: "orchestrator" | "lead" | "worker" | "user" | "system";
	agent: string;
	type: "delegate-request" | "delegate-response" | "user-input" | "system-event";
	target?: string;
	from?: string;
	content: string;
}

async function appendToLog(logPath: string, entry: LogEntry): Promise<void> {
	const line = `${JSON.stringify(entry)}\n`;
	await withFileMutationQueue(logPath, async () => {
		await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
		await fs.promises.appendFile(logPath, line, "utf-8");
	});
}

// ─── Cost tracking ──────────────────────────────────────────────────────────

function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

async function readSessionCost(sessionDir: string): Promise<number> {
	const file = path.join(sessionDir, "cost.json");
	try {
		const data = await fs.promises.readFile(file, "utf-8");
		return Number(JSON.parse(data).total_usd) || 0;
	} catch {
		return 0;
	}
}

async function addSessionCost(sessionDir: string, delta: number): Promise<number> {
	const file = path.join(sessionDir, "cost.json");
	let next = 0;
	await withFileMutationQueue(file, async () => {
		let current = 0;
		try {
			const data = await fs.promises.readFile(file, "utf-8");
			current = Number(JSON.parse(data).total_usd) || 0;
		} catch {
			/* file doesn't exist yet — counts as zero */
		}
		next = current + delta;
		await fs.promises.writeFile(
			file,
			JSON.stringify({ total_usd: next, updated: new Date().toISOString() }, null, 2),
		);
	});
	return next;
}

// ─── Subprocess invocation ──────────────────────────────────────────────────

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

interface SpawnResult {
	output: string;
	exitCode: number;
	stderr: string;
	stopReason?: string;
	usage: { input: number; output: number; cost: number; turns: number };
	/** Set when the agent ended via a `terminate: true` tool call (e.g. verdict).
	 * Carries the structured details from that tool call so callers can parse
	 * a typed result instead of doing string-matching on prose. */
	terminatedBy?: { toolName: string; details: unknown; text: string };
}

async function spawnAgent(
	repoRoot: string,
	agent: AgentFile,
	systemPrompt: string,
	taskMessage: string,
	myName: string,
	sessionDir: string,
	signal: AbortSignal | undefined,
): Promise<SpawnResult> {
	// System prompt -> temp file (long prompts can't be inlined as args)
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-multiteam-"));
	const promptFile = path.join(tmpDir, `${agent.name}-prompt.md`);
	await fs.promises.writeFile(promptFile, systemPrompt, { mode: 0o600 });

	const args = ["--mode", "json", "-p", "--no-session"];
	// MULTI_TEAM_MODEL_OVERRIDE forces every spawned agent (lead + worker) onto a
	// single model — used by `just pi test ...` recipes for cheap wiring smoke tests.
	const overrideModel = process.env.MULTI_TEAM_MODEL_OVERRIDE;
	const effectiveModel = overrideModel || agent.model;
	if (effectiveModel) args.push("--model", effectiveModel);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	args.push("--append-system-prompt", promptFile);
	args.push(`Task: ${taskMessage}`);

	const childEnv = {
		...process.env,
		MULTI_TEAM_AGENT_NAME: agent.name,
		MULTI_TEAM_CALLER: myName,
		MULTI_TEAM_SESSION_DIR: sessionDir,
	};

	const result: SpawnResult = {
		output: "",
		exitCode: 0,
		stderr: "",
		usage: { input: 0, output: 0, cost: 0, turns: 0 },
	};

	try {
		await new Promise<void>((resolve) => {
			const inv = getPiInvocation(args);
			const proc = spawn(inv.command, inv.args, {
				cwd: repoRoot,
				env: childEnv,
				stdio: ["ignore", "pipe", "pipe"],
				shell: false,
			});

			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}
				if (event.type === "message_end" && event.message?.role === "assistant") {
					const msg = event.message;
					for (const part of msg.content || []) {
						if (part.type === "text") result.output += part.text;
					}
					if (msg.usage) {
						result.usage.input += msg.usage.input || 0;
						result.usage.output += msg.usage.output || 0;
						result.usage.cost += msg.usage.cost?.total || 0;
						result.usage.turns += 1;
					}
					if (msg.stopReason) result.stopReason = msg.stopReason;
				}
				// `terminate: true` tool calls end the turn without an assistant
				// text message. Capture the tool's text + structured details so the
				// caller has something to use (and so verdict tool's structured
				// output flows back through delegate).
				if (event.type === "tool_execution_end" && event.toolName && event.result) {
					const r = event.result;
					let toolText = "";
					for (const part of r.content || []) {
						if (part.type === "text") toolText += part.text;
					}
					if (!result.output && toolText) result.output = toolText;
					if (r.terminate) {
						result.terminatedBy = {
							toolName: event.toolName,
							details: r.details,
							text: toolText,
						};
					}
				}
			};

			proc.stdout.on("data", (d) => {
				buffer += d.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const l of lines) processLine(l);
			});
			proc.stderr.on("data", (d) => {
				result.stderr += d.toString();
			});
			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				result.exitCode = code ?? 0;
				resolve();
			});
			proc.on("error", () => {
				result.exitCode = 1;
				resolve();
			});

			if (signal) {
				const kill = () => {
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) kill();
				else signal.addEventListener("abort", kill, { once: true });
			}
		});
	} finally {
		try {
			fs.unlinkSync(promptFile);
			fs.rmdirSync(tmpDir);
		} catch {
			/* ignore */
		}
	}

	return result;
}

// ─── Session bootstrap ──────────────────────────────────────────────────────

function ensureSessionDir(repoRoot: string, config: MultiTeamConfig): string {
	const fromEnv = process.env.MULTI_TEAM_SESSION_DIR;
	if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

	const sid = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
	const dir = path.resolve(repoRoot, config.paths.sessions, sid);
	fs.mkdirSync(dir, { recursive: true });
	// Write a small session header for forensics
	const headerPath = path.join(dir, "session.json");
	fs.writeFileSync(
		headerPath,
		JSON.stringify(
			{
				type: "multi-team-session",
				version: 1,
				id: sid,
				started: new Date().toISOString(),
				cwd: repoRoot,
			},
			null,
			2,
		),
	);
	return dir;
}

// ─── Extension entry point ──────────────────────────────────────────────────

const TaskItem = Type.Object({
	target: Type.String({ description: "Name of the agent to delegate to." }),
	message: Type.String({ description: "The task brief for that delegate." }),
});

const DelegateParams = Type.Object({
	// Single mode (mutually exclusive with tasks/chain)
	target: Type.Optional(
		Type.String({
			description:
				"Single mode: name of the agent to delegate to (e.g. 'engineering-lead', 'billing-engineer').",
		}),
	),
	message: Type.Optional(
		Type.String({
			description: "Single mode: task brief for the delegate. Be concrete: what to do, what 'done' looks like.",
		}),
	),
	// Parallel mode
	tasks: Type.Optional(
		Type.Array(TaskItem, {
			description: "Parallel mode: array of {target, message}. Independent delegates run concurrently.",
		}),
	),
	// Chain mode
	chain: Type.Optional(
		Type.Array(TaskItem, {
			description:
				"Chain mode: array of {target, message} executed sequentially. Use the literal '{previous}' in `message` to splice in the previous step's output.",
		}),
	),
});

// Concurrency-limited map (port from bundled subagent extension)
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const concurrency = Math.max(1, Math.min(limit, items.length));
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: concurrency }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return results;
}

export default function (pi: ExtensionAPI) {
	const repoRoot = findRepoRoot(process.cwd());
	if (!repoRoot) {
		// Not in a multi-team repo — silently skip. Don't fail other extensions.
		return;
	}

	let config: MultiTeamConfig;
	let agents: Map<string, AgentFile>;
	try {
		config = loadConfig(repoRoot);
		agents = loadAgents(repoRoot, config.paths.agents);
	} catch (e) {
		console.error(`[multi-team] failed to load config/agents: ${(e as Error).message}`);
		return;
	}

	const orchestratorName = path.basename(config.orchestrator.path, ".md");
	const myName = process.env.MULTI_TEAM_AGENT_NAME || orchestratorName;
	const myCaller = process.env.MULTI_TEAM_CALLER || "user";
	const sessionDir = ensureSessionDir(repoRoot, config);
	const conversationLog = path.join(sessionDir, config.conversation_log?.filename || "conversation.jsonl");

	// Surface state to the user/agent (orchestrator process only).
	if (!process.env.MULTI_TEAM_AGENT_NAME) {
		// Root process: we're the orchestrator. Print a one-line banner so the
		// user knows multi-team is active.
		process.stderr.write(
			`[multi-team] active: ${agents.size} agents, ${config.teams.length} teams. session=${path.basename(sessionDir)}\n`,
		);
	}

	pi.registerTool({
		name: "delegate",
		label: "Delegate",
		description: [
			"Delegate to specialized team-member agents in the multi-team system.",
			"Three modes:",
			"(1) SINGLE — pass {target, message}. One delegate.",
			"(2) PARALLEL — pass {tasks: [{target, message}, ...]}. Independent delegates run concurrently. Use for multi-perspective queries (ask-all-teams).",
			"(3) CHAIN — pass {chain: [{target, message}, ...]}. Sequential pipeline; use the literal '{previous}' inside `message` to splice in the prior step's output. Stops at first failure.",
			`You are: '${myName}'. Permitted targets: ${getPermittedTargets(myName, config).join(", ") || "(none — workers cannot delegate)"}.`,
		].join(" "),
		parameters: DelegateParams,

		async execute(_toolCallId, params, signal) {
			// ─── Per-delegation worker (single, parallel, and chain all flow through this) ───
			type RunResult = {
				target: string;
				text: string;
				usage?: SpawnResult["usage"];
				exitCode: number;
				stopReason?: string;
				stderr?: string;
				isError: boolean;
				errorReason?: string;
				terminatedBy?: SpawnResult["terminatedBy"];
			};
			const runOne = async (
				target: string,
				message: string,
				sig: AbortSignal | undefined,
			): Promise<RunResult> => {
				const allowed = getPermittedTargets(myName, config);
				if (!allowed.includes(target)) {
					return {
						target,
						text: `Cannot delegate to "${target}". As '${myName}' you may delegate to: ${allowed.join(", ") || "(no one — workers cannot delegate)"}.`,
						isError: true,
						exitCode: 1,
						errorReason: "permission-denied",
					};
				}
				const targetAgent = agents.get(target);
				if (!targetAgent) {
					return {
						target,
						text: `Unknown agent "${target}". Loaded: ${[...agents.keys()].join(", ")}.`,
						isError: true,
						exitCode: 1,
						errorReason: "unknown-agent",
					};
				}

				// Cost circuit breaker
				const costLimit = config.max_session_cost_usd ?? null;
				if (costLimit !== null && Number.isFinite(costLimit)) {
					const current = await readSessionCost(sessionDir);
					if (current >= costLimit) {
						const msg = `Session cost circuit breaker tripped: $${current.toFixed(4)} >= $${costLimit}. Refusing further delegations. Reset by deleting cost.json or raising max_session_cost_usd.`;
						await appendToLog(conversationLog, {
							ts: new Date().toISOString(),
							role: "system",
							agent: "circuit-breaker",
							type: "system-event",
							content: msg,
						});
						return { target, text: msg, isError: true, exitCode: 1, errorReason: "cost-cap" };
					}
				}

				const myRole = getCallerRole(myName, config);
				await appendToLog(conversationLog, {
					ts: new Date().toISOString(),
					role: myRole === "unknown" ? "system" : myRole,
					agent: myName,
					type: "delegate-request",
					target,
					content: message,
				});

				const systemPrompt = buildRenderedSystemPrompt(
					targetAgent,
					config,
					repoRoot,
					sessionDir,
					conversationLog,
					myName,
				);

				// Spawn with retry-on-transient-failure
				const TRANSIENT_RE = /rate.?limit|429|timeout|ECONNRESET|EAI_AGAIN|fetch\s*failed|socket hang up|\bENETDOWN\b/i;
				const MAX_ATTEMPTS = 2;
				let r: SpawnResult | null = null;
				for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
					r = await spawnAgent(repoRoot, targetAgent, systemPrompt, message, myName, sessionDir, sig);
					if (sig?.aborted) break;
					const failed =
						r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted";
					if (!failed) break;
					const transient = TRANSIENT_RE.test(r.stderr || "") || TRANSIENT_RE.test(r.output || "");
					if (!transient || attempt >= MAX_ATTEMPTS) break;
					await appendToLog(conversationLog, {
						ts: new Date().toISOString(),
						role: "system",
						agent: "harness",
						type: "system-event",
						content: `Transient failure spawning ${target} (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying after ${1.5 * attempt}s backoff.`,
					});
					await new Promise((res) => setTimeout(res, 1500 * attempt));
				}
				const final = r as SpawnResult;
				if (final.usage?.cost) await addSessionCost(sessionDir, final.usage.cost);

				const targetRole = getCallerRole(target, config);
				await appendToLog(conversationLog, {
					ts: new Date().toISOString(),
					role: targetRole === "unknown" ? "system" : (targetRole as any),
					agent: target,
					type: "delegate-response",
					from: myName,
					content: final.output || "(no output)",
				});

				const isError =
					final.exitCode !== 0 || final.stopReason === "error" || final.stopReason === "aborted";
				return {
					target,
					text: final.output || final.stderr || "(no output)",
					usage: final.usage,
					exitCode: final.exitCode,
					stopReason: final.stopReason,
					stderr: final.stderr.slice(-2000),
					isError,
					terminatedBy: final.terminatedBy,
				};
			};

			// ─── Mode dispatch ───
			const hasSingle = Boolean(params.target && params.message);
			const hasParallel = Array.isArray(params.tasks) && params.tasks.length > 0;
			const hasChain = Array.isArray(params.chain) && params.chain.length > 0;
			const modeCount = (hasSingle ? 1 : 0) + (hasParallel ? 1 : 0) + (hasChain ? 1 : 0);
			if (modeCount !== 1) {
				return {
					content: [
						{
							type: "text",
							text: `Provide exactly one mode. Got: ${modeCount}. Either {target, message} (single), {tasks: [{target,message},...]} (parallel), or {chain: [{target,message},...]} (sequential, with '{previous}' substitution).`,
						},
					],
					details: {},
					isError: true,
				};
			}

			if (hasSingle) {
				const r = await runOne(String(params.target), String(params.message), signal);
				return {
					content: [{ type: "text", text: r.text }],
					details: {
						mode: "single",
						target: r.target,
						exitCode: r.exitCode,
						stopReason: r.stopReason,
						usage: r.usage,
						stderr: r.stderr,
						sessionCost: await readSessionCost(sessionDir),
						terminatedBy: r.terminatedBy,
					},
					isError: r.isError,
				};
			}

			if (hasParallel) {
				const tasks = params.tasks as { target: string; message: string }[];
				const limit = config.max_parallel_delegations ?? 4;
				const results = await mapWithConcurrency(tasks, limit, (t) =>
					runOne(t.target, t.message, signal),
				);
				const successCount = results.filter((r) => !r.isError).length;
				const summary = results
					.map((r) => `[${r.target}] ${r.isError ? "failed" : "ok"}: ${r.text.length > 200 ? `${r.text.slice(0, 200)}…` : r.text}`)
					.join("\n\n");
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded.\n\n${summary}`,
						},
					],
					details: {
						mode: "parallel",
						results: results.map((r) => ({ target: r.target, isError: r.isError, usage: r.usage })),
						sessionCost: await readSessionCost(sessionDir),
					},
					isError: successCount < results.length,
				};
			}

			// hasChain
			const steps = params.chain as { target: string; message: string }[];
			const results: RunResult[] = [];
			let previous = "";
			for (let i = 0; i < steps.length; i++) {
				const step = steps[i];
				const msg = step.message.replace(/\{previous\}/g, previous);
				const r = await runOne(step.target, msg, signal);
				results.push(r);
				if (r.isError) {
					return {
						content: [
							{ type: "text", text: `Chain stopped at step ${i + 1} (${r.target}): ${r.text}` },
						],
						details: {
							mode: "chain",
							failedAt: i + 1,
							results: results.map((rr) => ({ target: rr.target, isError: rr.isError, usage: rr.usage })),
							sessionCost: await readSessionCost(sessionDir),
						},
						isError: true,
					};
				}
				previous = r.text;
			}
			const finalText = results[results.length - 1]?.text || "(no output)";
			return {
				content: [{ type: "text", text: finalText }],
				details: {
					mode: "chain",
					results: results.map((r) => ({ target: r.target, usage: r.usage })),
					sessionCost: await readSessionCost(sessionDir),
				},
			};
		},

		renderResult(result, _opts, theme) {
			const details = result.details as Record<string, any> | undefined;
			const text = result.content[0]?.type === "text" ? result.content[0].text : "(no output)";
			const target = (details?.target as string) || "?";
			const usage = details?.usage as
				| { input?: number; output?: number; cost?: number; turns?: number }
				| undefined;
			const sessionCost = details?.sessionCost as number | undefined;

			let body = `${theme.fg("toolTitle", theme.bold("delegate"))} ${theme.fg("accent", `→ ${target}`)}\n`;
			body += text.length > 800 ? `${text.slice(0, 800)}…` : text;
			const stats: string[] = [];
			if (usage?.turns) stats.push(`${usage.turns}t`);
			if (usage?.input) stats.push(`↑${formatTokens(usage.input)}`);
			if (usage?.output) stats.push(`↓${formatTokens(usage.output)}`);
			if (usage?.cost) stats.push(`$${usage.cost.toFixed(4)}`);
			if (typeof sessionCost === "number" && sessionCost > 0) {
				stats.push(`session $${sessionCost.toFixed(4)}`);
			}
			if (stats.length) body += `\n${theme.fg("dim", stats.join("  "))}`;
			return new Text(body, 0, 0);
		},
	});

	// ─── Structured verdict tool ─────────────────────────────────────────────
	// A `terminate: true` tool primarily for validation-lead. Lets the agent
	// emit a typed ship/fix/don't-ship decision that the orchestrator (or the
	// caller) can parse reliably, avoiding string-matching on prose.
	// Only exposed to agents that include `verdict` in their `tools:` block.
	pi.registerTool({
		name: "verdict",
		label: "Verdict",
		description: [
			"Emit a final ship/fix/don't-ship decision and end your turn.",
			"Use this as your last action when reviewing a change. After calling verdict, do not emit further text.",
			"`status` is the headline; `summary` explains in one line; `fixes` lists required-before-merge items; `blockers` lists things that must be resolved + re-reviewed.",
		].join(" "),
		parameters: Type.Object({
			status: Type.String({
				description: "One of: 'ship-it', 'ship-with-fixes', 'dont-ship'.",
			}),
			summary: Type.String({ description: "One-line headline of the verdict." }),
			fixes: Type.Optional(
				Type.Array(Type.String(), {
					description: "Required-before-merge items, one line each. Empty when status='ship-it'.",
				}),
			),
			blockers: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Items that block ship and require re-review. Use only with status='dont-ship'.",
				}),
			),
		}),
		async execute(_id, params) {
			const status = String(params.status);
			const lines = [`VERDICT: ${status}`, params.summary];
			const fixes = (params.fixes as string[] | undefined) || [];
			const blockers = (params.blockers as string[] | undefined) || [];
			if (fixes.length) {
				lines.push("", "Fixes:");
				for (const f of fixes) lines.push(`- ${f}`);
			}
			if (blockers.length) {
				lines.push("", "Blockers:");
				for (const b of blockers) lines.push(`- ${b}`);
			}
			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { status, summary: params.summary, fixes, blockers },
				terminate: true,
			};
		},
		renderResult(result, _opts, theme) {
			const d = result.details as {
				status?: string;
				summary?: string;
				fixes?: string[];
				blockers?: string[];
			};
			const icon =
				d.status === "ship-it" ? theme.fg("success", "✓") : d.status === "dont-ship" ? theme.fg("error", "✗") : theme.fg("warning", "◐");
			const lines = [
				`${icon} ${theme.fg("toolTitle", theme.bold("verdict"))} ${theme.fg("accent", d.status || "?")}`,
				theme.fg("text", d.summary || ""),
			];
			if (d.fixes?.length) {
				lines.push("", theme.fg("muted", "Fixes:"));
				for (const f of d.fixes) lines.push(theme.fg("warning", `  - ${f}`));
			}
			if (d.blockers?.length) {
				lines.push("", theme.fg("muted", "Blockers:"));
				for (const b of d.blockers) lines.push(theme.fg("error", `  - ${b}`));
			}
			return new Text(lines.join("\n"), 0, 0);
		},
	});

	// ─── Orchestrator system-prompt auto-load (root process only) ─────────────
	// When the user starts `pi` interactively at the root (no MULTI_TEAM_AGENT_NAME),
	// auto-inject the orchestrator's full rendered system prompt — skills,
	// expertise, runtime vars, body — so they are immediately the orchestrator
	// without needing the chat-full helper.
	if (!process.env.MULTI_TEAM_AGENT_NAME) {
		const orchestrator = agents.get(orchestratorName);
		if (orchestrator) {
			pi.on("before_agent_start", async (event) => {
				const sysPrompt = buildRenderedSystemPrompt(
					orchestrator,
					config,
					repoRoot,
					sessionDir,
					conversationLog,
					"user",
				);
				// Append our orchestrator persona to whatever system prompt PI already
				// assembled (default coding-agent prompt + AGENTS.md/CLAUDE.md, etc.).
				// Multiple before_agent_start handlers chain — `event.systemPrompt`
				// here is the most-recent fully-assembled prompt.
				return { systemPrompt: `${event.systemPrompt}\n\n${sysPrompt}` };
			});
		}
	}

	// ─── Domain enforcement (subprocesses only) ──────────────────────────────
	// Block tool calls that try to mutate paths outside the agent's declared
	// `domain:`. Skipped in the root orchestrator process — the orchestrator is
	// already locked down by --tools (no write/edit/bash exposed) and applying
	// enforcement here would interfere with the user's own ad-hoc work.
	const isSubprocess = Boolean(process.env.MULTI_TEAM_AGENT_NAME);
	if (isSubprocess) {
		const me = agents.get(myName);
		const rawRules = me?.domain || [];
		const resolvedRules = rawRules.map((r) => ({
			abs: resolveAbsolute(repoRoot, r.path),
			read: Boolean(r.read),
			update: Boolean(r.update),
			delete: Boolean(r.delete),
		}));

		const isPathAllowed = (p: string, op: "read" | "update" | "delete"): boolean => {
			const abs = resolveAbsolute(repoRoot, p);
			for (const rule of resolvedRules) {
				const isExactOrUnder = abs === rule.abs || abs.startsWith(rule.abs + path.sep);
				if (isExactOrUnder && rule[op]) return true;
			}
			return false;
		};

		const writableSummary = (): string => {
			const writable = resolvedRules.filter((r) => r.update);
			if (writable.length === 0) return "(no writable paths)";
			return writable.map((r) => path.relative(repoRoot, r.abs) || ".").join(", ");
		};

		// Heuristic: detect mutating bash commands. Imperfect — a determined LLM
		// can defeat it (e.g. via a heredoc-fed python -c). Treat as a guardrail,
		// not a sandbox. For real isolation: run each subagent in a container
		// (Docker/Podman) with a bind mount limited to its declared writable paths.
		const MUTATING_BASH_PATTERNS: RegExp[] = [
			// Mutating CLI verbs at any position in the pipeline
			/\b(rm|mv|cp|chmod|chown|truncate|dd|mkfifo|mknod|ln)\s+(-[a-zA-Z]+\s+)*[^\s|&;]/,
			// In-place editors
			/\bsed\s+(-i|--in-place)/,
			/\bawk\s+(-i\s+inplace)/,
			/\btee\s+(-a\s+)?[^\s|&;]/,
			// Scripting languages with -c / -e flags can do anything
			/\b(python3?|node|deno|bun|perl|ruby|php|lua)\s+-(c|e)\b/,
			// Heredocs (often used to write files)
			/<<-?\s*['"]?[A-Z_a-z]/,
			// Shell redirects to file (skip 2>&1 / 1>&2 forms via the no-& lookahead)
			/(?<!\d)(>>?)\s*[^&|0-9\s]/,
			// Destructive git
			/\bgit\s+(reset\s+--hard|checkout\s+--|clean\s+-f|rebase|push\s+(-f|--force))\b/,
			// find with -delete / -exec rm
			/\bfind\b[^|;&]*\b(-delete|-exec\s+rm)\b/,
			// curl/wget piped to shell
			/\b(curl|wget)\b[^|;&]*\|\s*(bash|sh|zsh)\b/,
		];

		const isMutatingBash = (cmd: string): boolean => MUTATING_BASH_PATTERNS.some((re) => re.test(cmd));

		pi.on("tool_call", async (event) => {
			// Path-bearing tools
			if (event.toolName === "write" || event.toolName === "edit") {
				const input = event.input as Record<string, unknown>;
				const p = (input.path || input.file_path) as string | undefined;
				if (typeof p === "string" && !isPathAllowed(p, "update")) {
					return {
						block: true,
						reason: `Path "${p}" is outside ${myName}'s writable domain. Allowed: ${writableSummary()}. If this work belongs elsewhere, report back to your lead so they can route it to the right agent.`,
					};
				}
			}
			// Read is permissive by default (most agents have `path: .` with read:true)
			// but we still enforce it so a hyper-restricted agent can be defined.
			if (event.toolName === "read") {
				const input = event.input as Record<string, unknown>;
				const p = (input.path || input.file_path) as string | undefined;
				if (typeof p === "string" && !isPathAllowed(p, "read")) {
					return {
						block: true,
						reason: `Path "${p}" is outside ${myName}'s readable domain.`,
					};
				}
			}
			// Bash: best-effort. Block obviously-mutating commands if the agent has no
			// writable paths at all (typical of leads / orchestrator).
			if (event.toolName === "bash") {
				const cmd = String((event.input as Record<string, unknown>).command || "");
				const writableCount = resolvedRules.filter((r) => r.update).length;
				if (writableCount === 0 && isMutatingBash(cmd)) {
					return {
						block: true,
						reason: `Bash command appears to mutate the filesystem but ${myName} has no writable domain. Refusing.`,
					};
				}
			}
			return undefined;
		});
	}

	// Optional: a /multi-team-status command for quick introspection.
	pi.registerCommand("multi-team-status", {
		description: "Show multi-team config: who I am, who I can delegate to, where the session lives.",
		handler: async (_args, ctx) => {
			const lines = [
				`identity:        ${myName} (${getCallerRole(myName, config)})`,
				`caller:          ${myCaller}`,
				`permitted:       ${getPermittedTargets(myName, config).join(", ") || "(none)"}`,
				`session_dir:     ${sessionDir}`,
				`conversation:    ${conversationLog}`,
				`agents loaded:   ${agents.size}`,
				`delegation:      ${config.delegation}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
