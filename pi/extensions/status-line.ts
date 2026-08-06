import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, watch as fsWatch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as pathJoin, resolve as pathResolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { type SettingItem, type SettingsListTheme, SettingsList, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Custom two-line footer / status-line extension.
 *
 * Left side is a shell-prompt-style path + git segment; line 1's right side
 * holds usage/context, line 2's right side holds model info. Extension
 * statuses default to line 1 (right, alongside usage/context) but can be
 * moved bottom-left (line 2) via /statusline config.
 *
 * Layout (position: right, the default):
 *   line 1: ~/project  on   main [ ...]        [ext icons]  ↑5k  ↓2k  $0.01  2.4%/1.0M
 *   line 2:                                                     provider/model • level
 *
 * Layout (position: left):
 *   line 1: ~/project  on   main [ ...]                    ↑5k  ↓2k  $0.01  2.4%/1.0M
 *   line 2: [ext icons]                                       provider/model • level
 *
 * Statuses published by other extensions are rendered with their original
 * ANSI colors preserved (see sanitizePreservingSgr).
 *
 * Commands:
 *   /statusline           Toggle this custom footer on/off (falls back to the default).
 *   /statusline config    Choose which extension statuses show, and their position.
 */

// ── Terminal-palette ANSI helper ─────────────────────────────────────────────
// Emits basic 16-color SGR codes that resolve against the terminal's *own*
// palette — so these follow whichever ghostty theme is active (dark/light)
// instead of being locked to one hue.
const ANSI_CODES: Record<string, number> = {
	black: 30,
	red: 31,
	green: 32,
	yellow: 33,
	blue: 34,
	purple: 35,
	magenta: 35,
	cyan: 36,
	white: 37,
	"bright-black": 90,
	"bright-red": 91,
	"bright-green": 92,
	"bright-yellow": 93,
	"bright-blue": 94,
	"bright-purple": 95,
	"bright-magenta": 95,
	"bright-cyan": 96,
	"bright-white": 97,
};

function ansiOpen(colorName: string): string {
	const code = ANSI_CODES[colorName] ?? 39;
	return `\x1b[${code}m`;
}

function ansi(colorName: string, text: string): string {
	return `${ansiOpen(colorName)}${text}\x1b[39m`;
}

// ── SGR-preserving sanitizer ─────────────────────────────────────────────────
// Third-party extension statuses are untrusted text: they may carry newlines or
// cursor-control escapes that would corrupt a single-line footer. We flatten and
// strip control characters, but keep SGR color sequences so foreign statuses
// still render in their own colors. Trick: stash the color sequences behind
// placeholders, scrub everything else, then restore them.
const safeSgrPattern = /\x1b\[[0-9;:]*m/g; // SGR (color/style) sequences only
const sgrPlaceholderPattern = /__MYSTATUS_SGR_(\d+)__/g;

function sanitizePreservingSgr(value: string): string {
	// 1. Pull out color sequences and replace each with a unique placeholder.
	const safeSequences: string[] = [];
	const protectedValue = value.replace(safeSgrPattern, (s) => {
		safeSequences.push(s);
		return `__MYSTATUS_SGR_${safeSequences.length - 1}__`;
	});
	// 2. Scrub the remaining text: drop VT/cursor escapes, flatten vertical
	//    whitespace to spaces, remove leftover control chars, collapse runs.
	//    (The C0/C1 strip overlaps stripVTControlCharacters on purpose — belt
	//    and suspenders against stray control bytes from foreign output.)
	const cleaned = stripVTControlCharacters(protectedValue)
		.replace(/[\r\n\t\f\v]+/g, " ")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	// 3. Put the original color sequences back where their placeholders landed.
	return cleaned.replace(sgrPlaceholderPattern, (_m, idx: string) => {
		const i = Number.parseInt(idx, 10);
		return safeSequences[i] ?? "";
	});
}

function hasVisible(text: string): boolean {
	return stripVTControlCharacters(text).trim().length > 0;
}

// ── Path formatting ──────────────────────────────────────────────────────────
// homedir() is stable for the process lifetime; normalize once (cross-platform).
const HOME = homedir().replace(/\\/g, "/").replace(/\/+$/, "");

function fmtCwd(cwd: string): string {
	const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
	if (normalized === HOME) return "~";
	if (HOME && normalized.startsWith(`${HOME}/`)) return `~/${normalized.slice(HOME.length + 1)}`;
	return normalized;
}

// ── Git status (porcelain v1 -b) ─────────────────────────────────────────────
// Freshness comes from two layers: an fs.watch on .git metadata invalidates
// the cache the instant a commit/checkout/stage happens (see ensureGitWatcher
// below); GIT_CACHE_MS is just the safety-net TTL for anything the watcher
// can't see (e.g. working-tree edits from outside pi).
type GitInfo = { branch: string; label: string } | null;
let gitCache: { cwd: string; value: GitInfo; ts: number } | undefined;
const GIT_CACHE_MS = 2000;

// Starship-style git icons
const GIT_ICONS = {
	branch: "",
	ahead: "",
	behind: "",
	diverged: " נּ",
	conflicted: "",
	modified: "󰏫",
	staged: "",
	renamed: "",
	deleted: "",
	untracked: "",
	stashed: "",
};

// porcelain v1 unmerged (conflict) XY codes.
const UNMERGED_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

// Runs git synchronously, so results are cached per-cwd for GIT_CACHE_MS to
// avoid spawning a process on every render frame.
function readGit(cwd: string): GitInfo {
	const now = Date.now();
	if (gitCache?.cwd === cwd && now - gitCache.ts < GIT_CACHE_MS) return gitCache.value;

	// Cache the result (including nulls) and return it in one step.
	const store = (value: GitInfo): GitInfo => {
		gitCache = { cwd, value, ts: now };
		return value;
	};

	try {
		// Cheap guard: bail out fast (via catch) when cwd isn't a work tree,
		// so we don't run a full status walk outside repos.
		execSync("git rev-parse --is-inside-work-tree", { cwd, timeout: 2000, stdio: "pipe" });
		const out = execSync("git status --porcelain=v1 -b", {
			cwd,
			timeout: 2000,
			encoding: "utf8",
			stdio: "pipe",
		});

		const lines = out.split(/\r?\n/).filter(Boolean);
		const headLine = lines[0] ?? "";
		// Matches "## branch...upstream [ahead N, behind M]" and plain "## branch".
		const m = headLine.match(/^##\s+(\S+?)(?:\.\.\.\S+)?(?:\s+\[(.+?)\])?\s*$/);
		if (!m) return store(null);

		const branch = m[1] ?? "";
		const flags = m[2] ?? "";

		// Ahead / behind vs upstream.
		let ahead = 0;
		let behind = 0;
		const aheadM = flags.match(/ahead\s+(\d+)/);
		const behindM = flags.match(/behind\s+(\d+)/);
		if (aheadM) ahead = Number(aheadM[1] ?? 0);
		if (behindM) behind = Number(behindM[1] ?? 0);

		// Count entries by state. Each porcelain line is "XY <path>": X is the
		// staged (index) status, Y the unstaged (work-tree) status. Order matters:
		// "?" means untracked, and unmerged codes must be caught before the
		// generic X/Y check or a conflict would count as staged + modified.
		let staged = 0;
		let modified = 0;
		let untracked = 0;
		let conflicted = 0;
		for (let i = 1; i < lines.length; i++) {
			const xy = lines[i]!.slice(0, 2);
			if (xy[0] === "?") {
				untracked++;
			} else if (UNMERGED_CODES.has(xy)) {
				conflicted++;
			} else {
				if (xy[0] !== " ") staged++;
				if (xy[1] !== " ") modified++;
			}
		}

		// Build the status label with starship icons.
		const parts: string[] = [];
		if (ahead > 0 && behind > 0) {
			parts.push(`${GIT_ICONS.diverged} ${GIT_ICONS.ahead} ${ahead} ${GIT_ICONS.behind} ${behind}`);
		} else if (ahead > 0) {
			parts.push(`${GIT_ICONS.ahead} ${ahead}`);
		} else if (behind > 0) {
			parts.push(`${GIT_ICONS.behind} ${behind}`);
		}
		if (conflicted) parts.push(`${GIT_ICONS.conflicted} ${conflicted}`);
		if (staged) parts.push(`${GIT_ICONS.staged} ${staged}`);
		if (modified) parts.push(`${GIT_ICONS.modified} ${modified}`);
		if (untracked) parts.push(`${GIT_ICONS.untracked} ${untracked}`);
		const label = parts.length ? `[${parts.join(" ")}]` : "";

		return store({ branch, label });
	} catch {
		return store(null);
	}
}

// ── Git watcher (event-driven cache invalidation) ────────────────────────────
// One-time setup per cwd. Watches .git metadata so the footer updates the
// instant something changes, instead of waiting out GIT_CACHE_MS.
const watchedGitCwds = new Set<string>();

function resolveGitDirs(cwd: string): { gitDir: string; commonDir: string } | null {
	try {
		// --git-dir is per-worktree (HEAD/index/MERGE_HEAD live there);
		// --git-common-dir is shared across worktrees (refs/heads live there).
		const gitDir = execSync("git rev-parse --git-dir", {
			cwd,
			timeout: 2000,
			encoding: "utf8",
			stdio: "pipe",
		}).trim();
		const commonDir = execSync("git rev-parse --git-common-dir", {
			cwd,
			timeout: 2000,
			encoding: "utf8",
			stdio: "pipe",
		}).trim();
		return { gitDir: pathResolve(cwd, gitDir), commonDir: pathResolve(cwd, commonDir) };
	} catch {
		return null;
	}
}

// fs.watch emits 'error' asynchronously on some platforms/limits (EMFILE,
// ENOSPC from inotify watch limits); an unhandled 'error' on an EventEmitter
// throws, so every watcher needs a no-op listener to degrade to TTL polling
// instead of crashing the process.
function watchQuietly(path: string, recursive: boolean, onChange: () => void): void {
	try {
		const watcher = fsWatch(path, { recursive }, onChange);
		watcher.on("error", () => watcher.close());
	} catch {
		// Unwatchable (missing, permission, no recursive support) — TTL covers it.
	}
}

function ensureGitWatcher(cwd: string, notify: () => void): void {
	if (watchedGitCwds.has(cwd)) return;
	const dirs = resolveGitDirs(cwd);
	if (!dirs) return;
	watchedGitCwds.add(cwd);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	const onChange = () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		// Git touches several files per operation (e.g. commit writes HEAD,
		// the branch ref, and logs/HEAD) — debounce to one invalidation.
		debounceTimer = setTimeout(() => {
			if (gitCache?.cwd === cwd) gitCache = undefined;
			notify();
		}, 250);
	};

	// Per-worktree gitdir: catches HEAD, index (staging), MERGE_HEAD.
	watchQuietly(dirs.gitDir, false, onChange);

	// Shared refs: branch creation/switch/commit. Recursive is needed for
	// branch names containing "/" (e.g. "feature/foo"); fall back to a flat
	// watch (misses nested names, still catches top-level branches).
	const refsHeads = pathJoin(dirs.commonDir, "refs", "heads");
	if (existsSync(refsHeads)) {
		try {
			const watcher = fsWatch(refsHeads, { recursive: true }, onChange);
			watcher.on("error", () => watcher.close());
		} catch {
			watchQuietly(refsHeads, false, onChange);
		}
	}

	// packed-refs etc.; skip if identical to gitDir (non-worktree repos).
	if (dirs.commonDir !== dirs.gitDir) watchQuietly(dirs.commonDir, false, onChange);
}

// ── Per-key status formatters ────────────────────────────────────────────────
// Keyed by the exact string an extension passes to ctx.ui.setStatus(key, ...).
// Overrides how that extension's raw status text renders here, and — unlike
// the generic path below — still renders when the source clears its status to
// "" (e.g. pi-sandbox when disabled), so on/off state stays visible.
const STATUS_FORMATTERS: Record<string, (raw: string, theme: Theme) => string> = {
	sandbox: (raw, theme) => {
		const on = stripVTControlCharacters(raw).trim().length > 0;
		return on ? ansi("purple", "● sandbox") : theme.fg("dim", "○ sandbox");
	},
	// pix-optimizer colors its enabled icons with the pi theme's "accent" token;
	// swap that specific sequence for terminal cyan so it follows ghostty's
	// palette instead, without touching the "dim" (disabled) icons.
	"pix-optimizer": (raw, theme) => {
		const accentAnsi = theme.getFgAnsi("accent");
		return raw.split(accentAnsi).join(ansiOpen("cyan"));
	},
};

// ── Extension status config (persisted, /statusline config) ─────────────────
// Same flat-JSON-in-~/.pi/agent convention as this repo's other extension
// state files (sandbox.json, optimizer.json, ...).
type ExtStatusPosition = "left" | "right";

const STATUS_LINE_CONFIG_FILE = pathJoin(homedir(), ".pi", "agent", "status-line.json");

function loadStatusLineConfig(): { hidden: Set<string>; position: ExtStatusPosition } {
	try {
		const data = JSON.parse(readFileSync(STATUS_LINE_CONFIG_FILE, "utf8")) as {
			hidden?: string[];
			position?: string;
		};
		return {
			hidden: new Set(data.hidden ?? []),
			position: data.position === "left" ? "left" : "right",
		};
	} catch {
		return { hidden: new Set(), position: "right" };
	}
}

function saveStatusLineConfig(hidden: Set<string>, position: ExtStatusPosition): void {
	try {
		mkdirSync(dirname(STATUS_LINE_CONFIG_FILE), { recursive: true });
		writeFileSync(
			STATUS_LINE_CONFIG_FILE,
			JSON.stringify({ hidden: [...hidden].sort(), position }, null, "\t"),
		);
	} catch {
		// Best-effort — the footer still filters/positions correctly this
		// session even if persistence fails (e.g. read-only home).
	}
}

const initialStatusLineConfig = loadStatusLineConfig();
const hiddenStatuses = initialStatusLineConfig.hidden;
let extStatusPosition: ExtStatusPosition = initialStatusLineConfig.position;

// Replaces SettingsList's own hardcoded (English) hint line in the config
// overlay; sized into the box width too so it never truncates.
const CONFIG_HINT_TEXT = "↑↓ move · space/enter change · esc close";

// ── Bordered overlay box ──────────────────────────────────────────────────────
// Adapted from @xynogen/pix-pretty's modal-frame (same author's monorepo,
// used by /optimizer) — inlined rather than imported because a file-based
// (non-npm) extension can't resolve packages that only live in the shared
// ~/.pi/agent/npm/node_modules tree.
function frameBox(lines: string[], width: number, theme: Theme): string[] {
	const inner = Math.max(1, width - 4); // 2 border cols + 2 padding
	const dashes = "─".repeat(Math.max(0, width - 2));
	const border = (s: string) => theme.fg("accent", s);
	const bg = (s: string) => theme.bg("customMessageBg", s);

	// theme.fg/theme.bold may emit a full reset (\x1b[0m) or bg-reset
	// (\x1b[49m) inside a line; re-open the box's background afterwards so
	// those resets don't punch transparent holes in it.
	const SENTINEL = "\x00";
	const bgOpen = bg(SENTINEL).split(SENTINEL)[0] ?? "";
	const reassert = (s: string): string =>
		bgOpen
			? s.replace(/\x1b\[([0-9;]*)m/g, (seq, p: string) =>
					p === "0" || p.split(";").includes("49") ? `${seq}${bgOpen}` : seq,
				)
			: s;

	const row = (content: string): string => {
		const pad = inner - visibleWidth(content);
		const padded = pad > 0 ? content + " ".repeat(pad) : truncateToWidth(content, inner);
		return bg(`${border("│")} ${reassert(padded)} ${border("│")}`);
	};

	return [bg(border(`╭${dashes}╮`)), ...lines.map(row), bg(border(`╰${dashes}╯`))];
}

// ── Number formatting ────────────────────────────────────────────────────────
// Compact human-readable counts: 950 -> "950", 5200 -> "5.2k", 42000 -> "42k",
// 1_200_000 -> "1.2M". One decimal only in the low part of each magnitude band.
function fmtNum(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	return `${Math.round(n / 1_000_000)}M`;
}

// ── Extension ────────────────────────────────────────────────────────────────
type TuiRef = { requestRender?: () => void } | null;

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let isWorking = false;
	let tuiRef: TuiRef = null;
	// Names seen on the last render, kept so /statusline config can list
	// extensions even ones currently hidden (and thus absent this frame).
	let knownStatusNames = new Set<string>();

	function requestRender() {
		tuiRef?.requestRender?.();
	}

	function installFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, footerData) => {
			tuiRef = tui;
			// Re-render when the session branch changes (new messages, usage, etc.);
			// unsub is returned as dispose so the subscription is cleaned up.
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					// Single pass over the branch: sum usage and track the last
					// thinking-level change at once (avoids copy + double scan).
					let input = 0;
					let output = 0;
					let cost = 0;
					let thinkingLevel: string | undefined;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage?.input ?? 0;
							output += m.usage?.output ?? 0;
							cost += m.usage?.cost?.total ?? 0;
						} else if (e.type === "thinking_level_change") {
							thinkingLevel = (e as { thinkingLevel?: string }).thinkingLevel;
						}
					}

					// ── model ─────────────────────────────────────────────
					let modelStr = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
					if (ctx.model?.reasoning) {
						const level = thinkingLevel ?? "off";
						modelStr += level === "off" ? " • thinking off" : ` • ${level}`;
					}

					// ── left: prompt-style path + git segment ─────────────
					const cwdLabel = ansi("green", fmtCwd(ctx.cwd));

					let gitStr = "";
					ensureGitWatcher(ctx.cwd, requestRender);
					const gitInfo = readGit(ctx.cwd);
					if (gitInfo) {
						const icon = ansi("blue", GIT_ICONS.branch);
						const branch = ansi("blue", gitInfo.branch);
						const tail = gitInfo.label ? ` ${ansi("red", gitInfo.label)}` : "";
						gitStr = ` ${theme.fg("dim", "on")} ${icon} ${branch}${tail}`;
					}

					const left = `${cwdLabel}${gitStr}`;

					// ── right, line 1: usage blocks (each colored) ────────
					const inputStr = input > 0 ? ansi("blue", `↑${fmtNum(input)}`) : "";
					const outputStr = output > 0 ? ansi("green", `↓${fmtNum(output)}`) : "";
					const costStr = cost > 0 ? ansi("bright-yellow", `$${cost.toFixed(2)}`) : "";
					const stats = [inputStr, outputStr, costStr].filter(Boolean).join("  ");

					// Context usage (aligned with pi's default footer).
					const ctxUsage = ctx.getContextUsage();
					const ctxWindow = ctx.model?.contextWindow ?? ctxUsage?.contextWindow;
					let ctxStr = "";
					if (ctxWindow && ctxWindow > 0) {
						const pctValue = ctxUsage?.percent ?? null;
						const pct = pctValue !== null ? `${pctValue.toFixed(1)}%` : "?";
						const display = `${pct}/${fmtNum(ctxWindow)}`;
						if (pctValue !== null && pctValue > 90) {
							ctxStr = ansi("red", display); // error red
						} else if (pctValue !== null && pctValue > 70) {
							ctxStr = ansi("yellow", display); // warning yellow
						} else {
							ctxStr = ansi("cyan", display); // accent teal
						}
					}

					// Extension statuses (SGR preserved), skip cwd duplicates and
					// anything hidden via /statusline config.
					const extStatuses: string[] = [];
					const cwdText = stripVTControlCharacters(fmtCwd(ctx.cwd));
					const sortedStatuses = [...footerData.getExtensionStatuses()].sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					);
					knownStatusNames = new Set(sortedStatuses.map(([name]) => name));
					for (const [name, value] of sortedStatuses) {
						if (hiddenStatuses.has(name)) continue;
						const formatter = STATUS_FORMATTERS[name];
						if (formatter) {
							extStatuses.push(sanitizePreservingSgr(formatter(value, theme)));
							continue;
						}
						const text = sanitizePreservingSgr(value);
						if (hasVisible(text) && stripVTControlCharacters(text).trim() !== cwdText) {
							extStatuses.push(text);
						}
					}
					const extStr = extStatuses.join("  ");

					// Join non-empty blocks with a 2-space separator and, crucially,
					// no trailing separator — otherwise line 1's right edge sits a
					// couple of columns short of line 2's and they look misaligned.
					// Extension statuses land on line 1 (right, default) or line 2
					// (bottom-left) depending on /statusline config.
					const right1Parts = extStatusPosition === "right" ? [extStr, stats, ctxStr] : [stats, ctxStr];
					const right1 = right1Parts.filter(Boolean).join("  ");
					const right2 = `${theme.fg("dim", modelStr)}`;
					const line2Left = extStatusPosition === "left" ? extStr : "";

					// ── compose ────────────────────────────────────────────
					const padLen = Math.max(1, width - visibleWidth(left) - visibleWidth(right1));
					const line1 = truncateToWidth(left + " ".repeat(padLen) + right1, width);
					const pad2Len = Math.max(1, width - visibleWidth(line2Left) - visibleWidth(right2));
					const line2 = truncateToWidth(
						line2Left
							? line2Left + " ".repeat(pad2Len) + right2
							: " ".repeat(Math.max(0, width - visibleWidth(right2))) + right2,
						width,
					);
					return [line1, line2];
				},
			};
		});
	}

	async function openStatusConfig(ctx: ExtensionCommandContext) {
		const names = [...new Set([...knownStatusNames, ...hiddenStatuses])].sort();

		const positionItem: SettingItem = {
			id: "__position__",
			label: "Position",
			description: "Where to show extension statuses in the footer",
			currentValue: extStatusPosition === "left" ? "Left" : "Right",
			values: ["Right", "Left"],
		};
		const items: SettingItem[] = [
			positionItem,
			...names.map((name) => ({
				id: name,
				label: name,
				currentValue: hiddenStatuses.has(name) ? "Hidden" : "Visible",
				values: ["Visible", "Hidden"],
			})),
		];
		// Mirror SettingsList's own column layout (prefix 2 + label col + sep 2 +
		// value col + slack 2) so values never truncate — see settings-list.js
		// renderMainList: valueMaxWidth = width - (2 + maxLabelWidth + 2) - 2.
		const maxLabelWidth = Math.min(30, Math.max(...items.map((i) => i.label.length)));
		const maxValueWidth = Math.max(
			...items.flatMap((i) => [i.currentValue.length, ...(i.values ?? []).map((v) => v.length)]),
		);
		const innerWidth = Math.max(
			"⚙  Statusline".length,
			maxLabelWidth + maxValueWidth + 6,
			visibleWidth(CONFIG_HINT_TEXT),
		);
		const boxWidth = Math.min(64, Math.max(28, innerWidth)) + 4; // + 2 border + 2 padding

		await ctx.ui.custom<void>(
			(_tui, theme, _keybindings, done) => {
				const settingsTheme: SettingsListTheme = {
					label: (text, selected) => (selected ? theme.fg("accent", text) : text),
					value: (text, selected) => (selected ? theme.fg("accent", text) : theme.fg("muted", text)),
					description: (text) => theme.fg("dim", text),
					cursor: theme.fg("accent", "→ "),
					hint: (text) => theme.fg("dim", text),
				};
				const list = new SettingsList(
					items,
					Math.min(items.length, 10),
					settingsTheme,
					(id, newValue) => {
						if (id === "__position__") {
							extStatusPosition = newValue === "Left" ? "left" : "right";
						} else if (newValue === "Hidden") {
							hiddenStatuses.add(id);
						} else {
							hiddenStatuses.delete(id);
						}
						saveStatusLineConfig(hiddenStatuses, extStatusPosition);
						requestRender();
					},
					() => done(),
				);
				return {
					render(width: number): string[] {
						const w = Math.min(boxWidth, width);
						const title = theme.bold(theme.fg("accent", "⚙  Statusline"));
						// SettingsList always appends its own (English, hardcoded) hint
						// as the last two lines ("" + hint text) — no theme hook to
						// override the string itself, so swap it for a French one here.
						const listLines = list.render(w - 4).slice(0, -2);
						const hint = theme.fg("dim", CONFIG_HINT_TEXT);
						return frameBox([title, "", ...listLines, "", hint], w, theme);
					},
					invalidate() {
						list.invalidate();
					},
					handleInput(data: string) {
						list.handleInput(data);
					},
				};
			},
			{ overlay: true, overlayOptions: { anchor: "center", width: boxWidth, maxHeight: "80%" } },
		);
	}

	pi.registerCommand("statusline", {
		description: "Toggle custom footer, or `config` to choose which extension statuses show and where",
		handler: async (args, ctx) => {
			if (args.trim() === "config") {
				await openStatusConfig(ctx);
				return;
			}

			enabled = !enabled;
			if (enabled) {
				installFooter(ctx);
				ctx.ui.notify("Custom footer ON", "info");
				requestRender();
			} else {
				ctx.ui.setFooter(undefined);
				tuiRef = null;
				ctx.ui.notify("Default footer restored", "info");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		isWorking = false;
		if (enabled) installFooter(ctx);
	});

	pi.on("model_select", async () => requestRender());
	pi.on("agent_start", async () => {
		isWorking = true;
		requestRender();
	});
	pi.on("agent_end", async () => {
		isWorking = false;
		requestRender();
	});
	pi.on("turn_end", async () => requestRender());
}