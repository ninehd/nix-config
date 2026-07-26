import { execSync } from "node:child_process";
import { existsSync, watch as fsWatch } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin, resolve as pathResolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Custom two-line footer / status-line extension.
 *
 * Left side is a shell-prompt-style path + git segment; the right side is
 * right-aligned across both lines and holds usage, context, and model info.
 *
 * Layout:
 *   line 1: ~/project  on   main [ ...]        [ext icons]  ↑5k  ↓2k  $0.01  2.4%/1.0M
 *   line 2:                                                              model • level
 *
 * Statuses published by other extensions are rendered with their original
 * ANSI colors preserved (see sanitizePreservingSgr).
 *
 * Command:
 *   /statusline    Toggle this custom footer on/off (falls back to the default).
 */

// ── Truecolor SGR helper (bypasses theme.fg, supports hex) ───────────────────
// Prefixes are cached: colors are a small fixed palette of literals.
const sgrCache = new Map<string, string>();

function sgrForHex(hexColor: string): string {
	let prefix = sgrCache.get(hexColor);
	if (prefix === undefined) {
		const r = Number.parseInt(hexColor.slice(1, 3), 16);
		const g = Number.parseInt(hexColor.slice(3, 5), 16);
		const b = Number.parseInt(hexColor.slice(5, 7), 16);
		prefix = `\x1b[38;2;${r};${g};${b}m`;
		sgrCache.set(hexColor, prefix);
	}
	return prefix;
}

function hex(hexColor: string, text: string): string {
	return `${sgrForHex(hexColor)}${text}\x1b[39m`;
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
					let modelStr = ctx.model?.id ?? "no-model";
					if (ctx.model?.reasoning) {
						const level = thinkingLevel ?? "off";
						modelStr += level === "off" ? " • thinking off" : ` • ${level}`;
					}

					// ── left: prompt-style path + git segment ─────────────
					const cwdLabel = theme.fg("success", fmtCwd(ctx.cwd));

					let gitStr = "";
					ensureGitWatcher(ctx.cwd, requestRender);
					const gitInfo = readGit(ctx.cwd);
					if (gitInfo) {
						const icon = hex("#8abeb7", GIT_ICONS.branch);
						const branch = hex("#8abeb7", gitInfo.branch);
						const tail = gitInfo.label ? ` ${hex("#8abeb7", gitInfo.label)}` : "";
						gitStr = ` ${theme.fg("dim", "on")} ${icon} ${branch}${tail}`;
					}

					const left = `${cwdLabel}${gitStr}`;

					// ── right, line 1: usage blocks (each colored) ────────
					const inputStr = input > 0 ? hex("#81a2be", `↑${fmtNum(input)}`) : "";
					const outputStr = output > 0 ? hex("#b5bd68", `↓${fmtNum(output)}`) : "";
					const costStr = cost > 0 ? hex("#d4d4d4", `$${cost.toFixed(2)}`) : "";
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
							ctxStr = hex("#cc6666", display); // error red
						} else if (pctValue !== null && pctValue > 70) {
							ctxStr = hex("#ffff00", display); // warning yellow
						} else {
							ctxStr = hex("#8abeb7", display); // accent teal
						}
					}

					// Extension statuses (SGR preserved), skip cwd duplicates.
					const extStatuses: string[] = [];
					const cwdText = stripVTControlCharacters(fmtCwd(ctx.cwd));
					const sortedStatuses = [...footerData.getExtensionStatuses()].sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					);
					for (const [, value] of sortedStatuses) {
						const text = sanitizePreservingSgr(value);
						if (hasVisible(text) && stripVTControlCharacters(text).trim() !== cwdText) {
							extStatuses.push(text);
						}
					}
					const extStr = extStatuses.join("  ");

					// Join non-empty blocks with a 2-space separator and, crucially,
					// no trailing separator — otherwise line 1's right edge sits a
					// couple of columns short of line 2's and they look misaligned.
					const right1 = [extStr, stats, ctxStr].filter(Boolean).join("  ");
					const right2 = `${theme.fg("dim", modelStr)}`;

					// ── compose ────────────────────────────────────────────
					const padLen = Math.max(1, width - visibleWidth(left) - visibleWidth(right1));
					const line1 = truncateToWidth(left + " ".repeat(padLen) + right1, width);
					const line2 = truncateToWidth(
						" ".repeat(Math.max(0, width - visibleWidth(right2))) + right2,
						width,
					);
					return [line1, line2];
				},
			};
		});
	}

	pi.registerCommand("statusline", {
		description: "Toggle custom footer",
		handler: async (_args, ctx) => {
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