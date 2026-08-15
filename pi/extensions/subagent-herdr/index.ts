import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.ts";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_START_TIMEOUT_MS = 30_000;
const DEFAULT_READ_LINES = 500;
const OUTPUT_CAP_BYTES = 50 * 1024;

type Placement = "split" | "tab" | "workspace";

interface HerdrRunResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	status: "completed" | "failed" | "blocked" | "aborted";
	herdrAgentName?: string;
	paneId?: string;
	output: string;
	rawOutput?: string;
	error?: string;
	step?: number;
}

interface HerdrSubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: HerdrRunResult[];
}

function bytes(input: string): number {
	return Buffer.byteLength(input, "utf8");
}

function truncateOutput(input: string, cap = OUTPUT_CAP_BYTES): string {
	if (bytes(input) <= cap) return input;
	let truncated = input.slice(0, cap);
	while (bytes(truncated) > cap) truncated = truncated.slice(0, -1);
	return `${truncated}\n\n[Output truncated: ${bytes(input) - bytes(truncated)} bytes omitted.]`;
}

function compactError(stderr: string, stdout: string): string {
	const text = (stderr || stdout || "herdr command failed").trim();
	return text.split("\n").slice(0, 12).join("\n");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPaneNotReadyError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("agent_pane_busy") || message.includes("not an available shell");
}

function normalizePathInput(input: string): string {
	return input.startsWith("@") ? input.slice(1) : input;
}

function resolveCwd(baseCwd: string, cwd: string | undefined): string {
	if (!cwd) return baseCwd;
	const normalized = normalizePathInput(cwd);
	return path.isAbsolute(normalized) ? normalized : path.resolve(baseCwd, normalized);
}

function parentModelId(ctx: { model?: { provider: string; id: string } }): string | undefined {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}

function safeAgentName(agentName: string): string {
	const clean = agentName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "");
	const base = (clean || "agent").replace(/^[^a-z]+/, "a").slice(0, 18);
	const suffix = Math.random().toString(36).slice(2, 8);
	return `sa-${base}-${suffix}`.slice(0, 32);
}

async function writeTempSystemPrompt(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-herdr-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(dir, `system-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir, filePath };
}

async function removeTempPrompt(tmp: { dir: string; filePath: string } | null): Promise<void> {
	if (!tmp) return;
	try {
		await fs.promises.unlink(tmp.filePath);
	} catch {
		/* ignore */
	}
	try {
		await fs.promises.rmdir(tmp.dir);
	} catch {
		/* ignore */
	}
}

async function runHerdrJson(
	pi: ExtensionAPI,
	args: string[],
	signal: AbortSignal | undefined,
	timeout: number,
): Promise<any> {
	const result = await pi.exec("herdr", args, { signal, timeout });
	if (result.code !== 0) throw new Error(compactError(result.stderr, result.stdout));
	try {
		return JSON.parse(result.stdout);
	} catch {
		throw new Error(`herdr returned non-JSON output for: herdr ${args.join(" ")}`);
	}
}

async function runHerdrText(
	pi: ExtensionAPI,
	args: string[],
	signal: AbortSignal | undefined,
	timeout: number,
): Promise<string> {
	const result = await pi.exec("herdr", args, { signal, timeout });
	if (result.code !== 0) throw new Error(compactError(result.stderr, result.stdout));
	return result.stdout;
}

async function runHerdrJsonWhenPaneReady(
	pi: ExtensionAPI,
	args: string[],
	signal: AbortSignal | undefined,
	timeout: number,
): Promise<any> {
	const deadline = Date.now() + timeout;
	let lastError: unknown;

	while (!signal?.aborted && Date.now() < deadline) {
		try {
			return await runHerdrJson(pi, args, signal, Math.max(1_000, deadline - Date.now()));
		} catch (error) {
			if (!isPaneNotReadyError(error)) throw error;
			lastError = error;
			await sleep(250);
		}
	}

	if (lastError) throw lastError;
	throw new Error(`Timed out waiting for pane to become an interactive shell: herdr ${args.join(" ")}`);
}

function buildPrompt(agent: AgentConfig, task: string): string {
	return [
		`You are Herdr-backed subagent ${agent.name}.`,
		"Work in your isolated context. Do not ask the parent for clarification unless impossible.",
		"Do not launch further Herdr subagents unless the task explicitly asks for nested delegation.",
		"Return your final answer between the exact markers below, with no extra text after the end marker.",
		"<<<SUBAGENT_RESULT_BEGIN>>>",
		"<final answer here>",
		"<<<SUBAGENT_RESULT_END>>>",
		"",
		"Task:",
		task,
	].join("\n");
}

function extractMarkedOutput(raw: string): string {
	const begin = "<<<SUBAGENT_RESULT_BEGIN>>>";
	const end = "<<<SUBAGENT_RESULT_END>>>";
	const beginIndex = raw.lastIndexOf(begin);
	const endIndex = raw.lastIndexOf(end);
	if (beginIndex >= 0 && endIndex > beginIndex) {
		return raw.slice(beginIndex + begin.length, endIndex).trim();
	}
	return `[Could not find subagent result markers. Raw Herdr pane output follows.]\n\n${raw.trim()}`;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

async function createPane(
	pi: ExtensionAPI,
	options: {
		placement: Placement;
		cwd: string;
		direction: "right" | "down";
		label: string;
		startTimeoutMs: number;
		splitFromPaneId?: string;
	},
	signal: AbortSignal | undefined,
): Promise<string> {
	if (options.placement === "split") {
		const args = options.splitFromPaneId
			? ["pane", "split", "--pane", options.splitFromPaneId]
			: ["pane", "split", "--current"];
		args.push("--direction", options.direction, "--cwd", options.cwd, "--no-focus");
		const split = await runHerdrJson(pi, args, signal, options.startTimeoutMs);
		const paneId = split?.result?.pane?.pane_id;
		if (!paneId) throw new Error("Could not read pane_id from herdr pane split output.");
		return paneId;
	}

	const command = options.placement === "tab" ? "tab" : "workspace";
	const created = await runHerdrJson(
		pi,
		[command, "create", "--cwd", options.cwd, "--label", options.label, "--no-focus"],
		signal,
		options.startTimeoutMs,
	);
	const paneId = created?.result?.root_pane?.pane_id ?? created?.result?.pane?.pane_id;
	if (!paneId) throw new Error(`Could not read root_pane.pane_id from herdr ${command} create output.`);
	return paneId;
}

const TaskItem = Type.Object({
	agent: Type.String({ description: "Agent name" }),
	task: Type.String({ description: "Task text" }),
	cwd: Type.Optional(Type.String({ description: "Working directory" })),
});

const ChainItem = Type.Object({
	...TaskItem.properties,
	task: Type.String({ description: "Task text; supports {previous}" }),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: "Agent source scope",
	default: "user",
});

const DirectionSchema = StringEnum(["right", "down"] as const, {
	description: "Split direction",
	default: "right",
});

const PlacementSchema = StringEnum(["split", "tab", "workspace"] as const, {
	description: "Subagent location",
});

const Params = Type.Object({
	agent: Type.Optional(Type.String({ description: "Single agent" })),
	task: Type.Optional(Type.String({ description: "Single task" })),
	tasks: Type.Optional(Type.Array(TaskItem, { description: "Parallel tasks" })),
	chain: Type.Optional(Type.Array(ChainItem, { description: "Sequential tasks" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(Type.Boolean({ description: "Confirm project agents", default: true })),
	kind: Type.Optional(Type.String({ description: "Herdr agent kind" })),
	placement: Type.Optional(PlacementSchema),
	direction: Type.Optional(DirectionSchema),
	cwd: Type.Optional(Type.String({ description: "Single working directory" })),
	timeoutMs: Type.Optional(Type.Integer({ minimum: 1_000, description: "Prompt timeout ms" })),
	startTimeoutMs: Type.Optional(Type.Integer({ minimum: 3_001, description: "Startup timeout ms" })),
	readLines: Type.Optional(Type.Integer({ minimum: 20, maximum: 5_000, description: "Lines to read" })),
	closePanes: Type.Optional(Type.Boolean({ description: "Close panes after run", default: false })),
});

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (process.env.HERDR_ENV !== "1") return;
		return {
			systemPrompt:
				event.systemPrompt +
				"\n\nPi/Herdr sub-agent policy: when a user request or loaded skill calls for sub-agents, parallel agents, isolated reviewers, scouts, or agents that should not share context, use the `subagent_herdr` tool. Do not simulate separate agents inside the parent context unless `subagent_herdr` is unavailable. For the `code-review` skill step that spawns Standards and Spec sub-agents in parallel, call `subagent_herdr` in parallel mode and aggregate its two outputs.",
		};
	});

	pi.on("input", (event) => {
		if (process.env.HERDR_ENV !== "1") return;
		if (event.source === "extension") return;
		const text = event.text;
		const normalized = text.toLowerCase();
		const mentionsCodeReviewSkill =
			normalized.startsWith("/skill:code-review") ||
			normalized.startsWith("/code-review") ||
			normalized.includes("skill code-review") ||
			normalized.includes("skill review") ||
			normalized.includes("skill reviewer") ||
			normalized.includes("utilise le skill review") ||
			normalized.includes("utiliser le skill review");

		if (!mentionsCodeReviewSkill || text.includes("subagent_herdr")) return;
		return {
			action: "transform" as const,
			text:
				text +
				"\n\nPi/Herdr policy for this review: use `subagent_herdr` for any required sub-agents, especially Standards and Spec parallel reviewers. Do not run both review axes only in the parent context.",
		};
	});

	async function runSingleAgent(
		agents: AgentConfig[],
		agentName: string,
		task: string,
		options: {
			cwd: string;
			kind: string;
			placement: Placement;
			direction: "right" | "down";
			timeoutMs: number;
			startTimeoutMs: number;
			readLines: number;
			closePanes: boolean;
			label: string;
			model?: string;
			thinkingLevel?: string;
			paneId?: string;
			splitFromPaneId?: string;
			step?: number;
		},
		signal: AbortSignal | undefined,
		onUpdate: ((text: string) => void) | undefined,
	): Promise<HerdrRunResult> {
		const agent = agents.find((candidate) => candidate.name === agentName);
		if (!agent) {
			const available = agents.map((candidate) => `"${candidate.name}"`).join(", ") || "none";
			return {
				agent: agentName,
				agentSource: "unknown",
				task,
				status: "failed",
				output: `Unknown agent: "${agentName}". Available agents: ${available}.`,
				error: `Unknown agent: "${agentName}".`,
				step: options.step,
			};
		}

		let paneId: string | undefined;
		let herdrAgentName: string | undefined;
		let tmpPrompt: { dir: string; filePath: string } | null = null;

		try {
			onUpdate?.(`creating ${options.placement} for ${agent.name}`);
			paneId = options.paneId ?? (await createPane(pi, options, signal));

			herdrAgentName = safeAgentName(agent.name);
			const startArgs = ["agent", "start", herdrAgentName, "--kind", options.kind, "--pane", paneId, "--timeout", String(options.startTimeoutMs)];
			const nativeArgs: string[] = [];
			const model = agent.model ?? options.model;
			if (model) nativeArgs.push("--model", model);
			if (!agent.model && options.thinkingLevel) nativeArgs.push("--thinking", options.thinkingLevel);
			if (agent.tools && agent.tools.length > 0) nativeArgs.push("--tools", agent.tools.join(","));
			if (agent.systemPrompt.trim()) {
				tmpPrompt = await writeTempSystemPrompt(agent.name, agent.systemPrompt);
				nativeArgs.push("--append-system-prompt", tmpPrompt.filePath);
			}
			if (nativeArgs.length > 0) startArgs.push("--", ...nativeArgs);

			onUpdate?.(`starting ${herdrAgentName} in ${paneId}`);
			await runHerdrJsonWhenPaneReady(pi, startArgs, signal, options.startTimeoutMs + 10_000);

			onUpdate?.(`prompting ${herdrAgentName}`);
			const promptResult = await runHerdrJson(
				pi,
				["agent", "prompt", herdrAgentName, buildPrompt(agent, task), "--wait", "--timeout", String(options.timeoutMs)],
				signal,
				options.timeoutMs + 10_000,
			);

			const settledState = promptResult?.result?.agent?.agent_status ?? promptResult?.result?.status;
			const rawOutput = await runHerdrText(
				pi,
				["agent", "read", herdrAgentName, "--source", "recent-unwrapped", "--lines", String(options.readLines)],
				signal,
				30_000,
			);
			const output = truncateOutput(extractMarkedOutput(rawOutput));
			const status = settledState === "blocked" ? "blocked" : "completed";

			return {
				agent: agent.name,
				agentSource: agent.source,
				task,
				status,
				herdrAgentName,
				paneId,
				output,
				rawOutput: truncateOutput(rawOutput, OUTPUT_CAP_BYTES),
				step: options.step,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			let rawOutput = "";
			if (herdrAgentName) {
				try {
					rawOutput = await runHerdrText(
						pi,
						["agent", "read", herdrAgentName, "--source", "recent-unwrapped", "--lines", String(options.readLines)],
						signal,
						30_000,
					);
				} catch {
					/* ignore */
				}
			}
			return {
				agent: agent.name,
				agentSource: agent.source,
				task,
				status: signal?.aborted ? "aborted" : "failed",
				herdrAgentName,
				paneId,
				output: truncateOutput(rawOutput ? `${message}\n\n${rawOutput}` : message),
				rawOutput: rawOutput ? truncateOutput(rawOutput) : undefined,
				error: message,
				step: options.step,
			};
		} finally {
			await removeTempPrompt(tmpPrompt);
			if (options.closePanes && paneId) {
				try {
					await runHerdrJson(pi, ["pane", "close", paneId], signal, 10_000);
				} catch {
					/* ignore */
				}
			}
		}
	}

	pi.registerTool({
		name: "subagent_herdr",
		label: "Subagent Herdr",
		description: `Run named agents in visible Herdr panes. Modes: single, parallel, chain. User agents: ${path.join(getAgentDir(), "agents")}; project agents: ${CONFIG_DIR_NAME}/agents.`,
		promptSnippet: "Run visible Herdr subagents for delegated or parallel work.",
		promptGuidelines: ["Use subagent_herdr only when isolated visible subagents are needed."],
		parameters: Params,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (process.env.HERDR_ENV !== "1") {
				throw new Error("subagent_herdr requires HERDR_ENV=1. Start pi inside a Herdr-managed pane.");
			}

			const agentScope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? true;
			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);
			const mode: "single" | "parallel" | "chain" = hasChain ? "chain" : hasTasks ? "parallel" : "single";
			const makeDetails = (results: HerdrRunResult[]): HerdrSubagentDetails => ({
				mode,
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				results,
			});

			if (modeCount !== 1) {
				const available = agents.map((agent) => `${agent.name} (${agent.source})`).join(", ") || "none";
				throw new Error(`Invalid parameters. Provide exactly one mode. Available agents: ${available}`);
			}

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents) {
				const requested = new Set<string>();
				if (params.chain) for (const item of params.chain) requested.add(item.agent);
				if (params.tasks) for (const item of params.tasks) requested.add(item.agent);
				if (params.agent) requested.add(params.agent);
				const projectAgents = Array.from(requested)
					.map((name) => agents.find((agent) => agent.name === name))
					.filter((agent): agent is AgentConfig => agent?.source === "project");

				if (projectAgents.length > 0) {
					if (!ctx.hasUI) {
						throw new Error("Project-local agents requested but UI confirmation is unavailable. Re-run with confirmProjectAgents=false only for trusted repos.");
					}
					const names = projectAgents.map((agent) => agent.name).join(", ");
					const ok = await ctx.ui.confirm(
						"Run project-local Herdr subagents?",
						`Agents: ${names}\nSource: ${discovery.projectAgentsDir ?? "(unknown)"}\n\nProject agents are repo-controlled. Continue only for trusted repositories.`,
					);
					if (!ok) throw new Error("Canceled: project-local agents not approved.");
				}
			}

			const placement = (params.placement ?? (mode === "single" ? "split" : "tab")) as Placement;
			const baseOptions = {
				kind: params.kind ?? "pi",
				placement,
				direction: (params.direction ?? "right") as "right" | "down",
				timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				startTimeoutMs: params.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS,
				readLines: params.readLines ?? DEFAULT_READ_LINES,
				closePanes: params.closePanes ?? false,
				model: parentModelId(ctx),
				thinkingLevel: ctx.thinkingLevel,
			};

			const closeRunPanes = async (runs: HerdrRunResult[]) => {
				if (!baseOptions.closePanes) return;
				for (const paneId of new Set(runs.map((run) => run.paneId).filter((id): id is string => Boolean(id)))) {
					try {
						await runHerdrJson(pi, ["pane", "close", paneId], signal, 10_000);
					} catch {
						/* ignore */
					}
				}
			};

			if (params.chain && params.chain.length > 0) {
				const results: HerdrRunResult[] = [];
				let groupRootPaneId: string | undefined;
				if (placement !== "split") {
					groupRootPaneId = await createPane(
						pi,
						{
							...baseOptions,
							cwd: resolveCwd(ctx.cwd, params.chain[0]?.cwd),
							label: "subagents: chain",
						},
						signal,
					);
				}

				try {
					let previousOutput = "";
					for (let index = 0; index < params.chain.length; index++) {
						const item = params.chain[index];
						const task = item.task.replace(/\{previous\}/g, previousOutput);
						onUpdate?.({ content: [{ type: "text", text: `chain step ${index + 1}/${params.chain.length}: ${item.agent}` }], details: makeDetails(results) });
						const result = await runSingleAgent(
							agents,
							item.agent,
							task,
							{
								...baseOptions,
								placement: groupRootPaneId && index > 0 ? "split" : placement,
								closePanes: groupRootPaneId ? false : baseOptions.closePanes,
								cwd: resolveCwd(ctx.cwd, item.cwd),
								label: `subagent: ${item.agent}`,
								paneId: groupRootPaneId && index === 0 ? groupRootPaneId : undefined,
								splitFromPaneId: groupRootPaneId && index > 0 ? groupRootPaneId : undefined,
								step: index + 1,
							},
							signal,
							(text) => onUpdate?.({ content: [{ type: "text", text }], details: makeDetails(results) }),
						);
						results.push(result);
						if (result.status !== "completed") {
							throw new Error(`Chain stopped at step ${index + 1} (${item.agent}):\n\n${result.output}`);
						}
						previousOutput = result.output;
					}
					return { content: [{ type: "text", text: results[results.length - 1]?.output ?? "(no output)" }], details: makeDetails(results) };
				} finally {
					await closeRunPanes(results);
				}
			}

			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > MAX_PARALLEL_TASKS) {
					throw new Error(`Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`);
				}

				const partials: HerdrRunResult[] = [];
				let groupRootPaneId: string | undefined;
				if (placement !== "split") {
					groupRootPaneId = await createPane(
						pi,
						{
							...baseOptions,
							cwd: resolveCwd(ctx.cwd, params.tasks[0]?.cwd),
							label: "subagents: parallel",
						},
						signal,
					);
				}

				try {
					const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (item, index) => {
						onUpdate?.({ content: [{ type: "text", text: `parallel ${partials.length}/${params.tasks!.length} done; starting ${item.agent}` }], details: makeDetails(partials) });
						const result = await runSingleAgent(
							agents,
							item.agent,
							item.task,
							{
								...baseOptions,
								placement: groupRootPaneId && index > 0 ? "split" : placement,
								closePanes: groupRootPaneId ? false : baseOptions.closePanes,
								cwd: resolveCwd(ctx.cwd, item.cwd),
								label: `subagent: ${item.agent}`,
								paneId: groupRootPaneId && index === 0 ? groupRootPaneId : undefined,
								splitFromPaneId: groupRootPaneId && index > 0 ? groupRootPaneId : undefined,
							},
							signal,
							(text) => onUpdate?.({ content: [{ type: "text", text }], details: makeDetails(partials) }),
						);
						partials[index] = result;
						onUpdate?.({ content: [{ type: "text", text: `parallel ${partials.filter(Boolean).length}/${params.tasks!.length} done` }], details: makeDetails(partials.filter(Boolean)) });
						return result;
					});

					const success = results.filter((result) => result.status === "completed").length;
					const text = `Parallel: ${success}/${results.length} completed\n\n${results
						.map((result) => `### [${result.agent}] ${result.status}${result.paneId ? ` (${result.paneId})` : ""}\n\n${result.output}`)
						.join("\n\n---\n\n")}`;
					if (success !== results.length) throw new Error(text);
					return { content: [{ type: "text", text }], details: makeDetails(results) };
				} finally {
					await closeRunPanes(partials.filter(Boolean));
				}
			}

			if (params.agent && params.task) {
				const result = await runSingleAgent(
					agents,
					params.agent,
					params.task,
					{ ...baseOptions, cwd: resolveCwd(ctx.cwd, params.cwd), label: `subagent: ${params.agent}` },
					signal,
					(text) => onUpdate?.({ content: [{ type: "text", text }], details: makeDetails([]) }),
				);
				if (result.status !== "completed") throw new Error(result.output);
				return { content: [{ type: "text", text: result.output }], details: makeDetails([result]) };
			}

			throw new Error("Invalid parameters.");
		},

		renderCall(args, theme) {
			const mode = args.chain?.length ? `chain (${args.chain.length})` : args.tasks?.length ? `parallel (${args.tasks.length})` : args.agent ?? "single";
			return new Text(`${theme.fg("toolTitle", theme.bold("subagent_herdr "))}${theme.fg("accent", mode)}`, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as HerdrSubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const completed = details.results.filter((run) => run.status === "completed").length;
			let text = `${theme.fg("toolTitle", theme.bold("subagent_herdr "))}${theme.fg("accent", `${completed}/${details.results.length} completed`)}`;
			for (const run of details.results) {
				const icon = run.status === "completed" ? theme.fg("success", "✓") : theme.fg("warning", "✗");
				text += `\n${icon} ${theme.fg("accent", run.agent)}${run.paneId ? theme.fg("muted", ` ${run.paneId}`) : ""}`;
				if (expanded) text += `\n${theme.fg("dim", run.output.split("\n").slice(0, 40).join("\n"))}`;
			}
			if (!expanded) text += `\n${theme.fg("muted", "expand to view outputs")}`;
			return new Text(text, 0, 0);
		},
	});
}
