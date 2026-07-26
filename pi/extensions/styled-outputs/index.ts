import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AssistantMessageComponent, UserMessageComponent, ToolExecutionComponent, SkillInvocationMessageComponent, CustomMessageComponent, BashExecutionComponent, truncateTail, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, keyText } from "@earendil-works/pi-coding-agent";
import { Markdown, Text } from "@earendil-works/pi-tui";
import { PATCH_FLAG, setCurrentTheme, currentTheme, applyColor, toolPrefix, errorPrefix } from "./utils.js";
import { CONFIG } from "./config.js";
import { createAssistantMessage } from "./components/assistant-message.js";
import { createThinkingMessage } from "./components/thinking-message.js";
import { createUserMessage } from "./components/user-message.js";
import {
  renderReadCall, renderReadResult,
  renderBashCall, renderBashResult,
  renderEditCall, renderEditResult,
  renderWriteCall, renderWriteResult,
  renderLsCall, renderLsResult,
  renderGrepCall, renderGrepResult,
  renderFindCall, renderFindResult,
} from "./components/base-renderer.js";
import { renderMcpCall, renderMcpResult } from "./components/mcp-renderer.js";
import {
  renderWebSearchCall, renderWebSearchResult,
  renderFetchContentCall, renderFetchContentResult,
  renderGetSearchContentCall, renderGetSearchContentResult,
} from "./components/web-renderer.js";
import { createSkillInvocationMessage } from "./components/skill-message.js";
import { createCustomMessage } from "./components/custom-message.js";
import { branchLine, doneLabel, errorLabel, expandHint, formatExpandedLines } from "./components/tool-shared.js";

const WEB_TOOLS = new Set(["web_search", "fetch_content", "get_search_content"]);

// Base tools are rendered here (not via pi.registerTool) so styled-outputs never
// competes for ownership of the tool's execute() — another extension (e.g. a
// sandboxing extension re-registering "bash") keeps full control of execution,
// while this always supplies the styled call/result renderers regardless of
// which extension's definition wins that race.
const BASE_RENDERERS: Record<string, { call: (args: any, theme: any, ctx: any) => any; result: (result: any, options: any, theme: any, ctx: any) => any }> = {
  read: { call: renderReadCall, result: renderReadResult },
  bash: { call: renderBashCall, result: renderBashResult },
  edit: { call: renderEditCall, result: renderEditResult },
  write: { call: renderWriteCall, result: renderWriteResult },
  grep: { call: renderGrepCall, result: renderGrepResult },
  find: { call: renderFindCall, result: renderFindResult },
  ls: { call: renderLsCall, result: renderLsResult },
};

export default function styledOutputs(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    setCurrentTheme(ctx.ui.theme);
  });

  // --- Patch AssistantMessageComponent ---
  const assistantProto = AssistantMessageComponent.prototype as any;
  if (!assistantProto[PATCH_FLAG]) {
    const originalUpdateContent = assistantProto.updateContent;
    assistantProto.updateContent = function patchedUpdateContent(message: any) {
      if (!message?.content || !Array.isArray(message.content)) {
        return originalUpdateContent.call(this, message);
      }

      originalUpdateContent.call(this, message);

      const container = this.contentContainer;
      if (!container?.children) return;

      // Derive, in order, which rendered Markdown blocks are "thinking" vs "text"
      // straight from message.content[].type — the same field pi-core's own
      // updateContent() uses to decide what to render. Mirrors its grouping rules
      // (consecutive thinking blocks merge into one Markdown; empty blocks and
      // hidden-thinking labels produce no Markdown) so this stays index-aligned
      // with container.children without relying on rendering style (e.g. italic)
      // as a proxy for block type.
      const blockKinds: ("text" | "thinking")[] = [];
      for (let i = 0; i < message.content.length; i++) {
        const c = message.content[i];
        if (c.type === "text" && c.text?.trim()) {
          blockKinds.push("text");
        } else if (c.type === "thinking") {
          let hasContent = false;
          for (; i < message.content.length && message.content[i].type === "thinking"; i++) {
            if (message.content[i].thinking?.trim()) hasContent = true;
          }
          i--;
          if (hasContent && !this.hideThinkingBlock) blockKinds.push("thinking");
        }
      }

      const mdTheme = this.markdownTheme;
      let blockIndex = 0;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i];
        if (child instanceof Markdown) {
          const mdChild = child as any;
          const text = mdChild.text;
          if (!text) continue;

          const kind = blockKinds[blockIndex++] ?? (mdChild.defaultTextStyle?.italic ? "thinking" : "text");
          if (kind === "thinking") {
            container.children[i] = createThinkingMessage(text, mdTheme);
          } else {
            container.children[i] = createAssistantMessage(text, mdTheme);
          }
        }
      }
    };

    assistantProto[PATCH_FLAG] = true;
  }

  // --- Patch UserMessageComponent ---
  const userProto = UserMessageComponent.prototype as any;
  if (!userProto[PATCH_FLAG]) {
    const originalUserRender = userProto.render;
    userProto.render = function patchedUserRender(width: number) {
      const contentBox = this.contentBox;
      if (contentBox?.children && !this._styledReplaced) {
        for (let i = 0; i < contentBox.children.length; i++) {
          const child = contentBox.children[i];
          if (child instanceof Markdown) {
            const mdChild = child as any;
            const text = mdChild.text;
            if (text) {
              contentBox.children[i] = createUserMessage(text, mdChild.theme);
            }
          }
        }
        
        contentBox.paddingX = 0;
        
        if (!CONFIG.userMessage.isThemeBackgroundVisible) {
          contentBox.paddingY = 0;
          contentBox.setBgFn(undefined);
        }
        this._styledReplaced = true;
      }
      return originalUserRender.call(this, width);
    };

    userProto[PATCH_FLAG] = true;
  }

  // --- Patch ToolExecutionComponent (conditionally apply bg) ---
  const toolProto = ToolExecutionComponent.prototype as any;
  if (!toolProto[PATCH_FLAG]) {
    const originalUpdateDisplay = toolProto.updateDisplay;
    toolProto.updateDisplay = function patchedUpdateDisplay() {
      const savedResult = this.result;
      if (this.isPartial) this.result = undefined;
      originalUpdateDisplay.call(this);
      this.result = savedResult;
      if (this.contentBox) {
        this.contentBox.paddingY = CONFIG.tools.general.verticalPadding;
        this.contentBox.paddingX = CONFIG.tools.general.horizontalPadding;
        if (CONFIG.tools.general.isThemeBackgroundVisible) {
          const t = currentTheme!;
          const bgFn = this.isPartial
            ? (text: string) => t.bg("toolPendingBg", text)
            : this.result?.isError
              ? (text: string) => t.bg("toolErrorBg", text)
              : (text: string) => t.bg("toolSuccessBg", text);
          this.contentBox.setBgFn(bgFn);
        } else {
          this.contentBox.setBgFn(undefined);
        }
      }
    };

    // --- Inject base/web/MCP renderers ---
    const originalGetCallRenderer = toolProto.getCallRenderer;
    toolProto.getCallRenderer = function patchedGetCallRenderer() {
      const name = this.toolName;
      const base = BASE_RENDERERS[name];
      if (base) return (args: any, theme: any, ctx: any) => base.call(args, theme, ctx);

      const renderer = originalGetCallRenderer.call(this);
      if (renderer !== undefined) return renderer;
      if (WEB_TOOLS.has(name)) {
        if (name === "web_search") return (args: any, theme: any, ctx: any) => renderWebSearchCall(args, theme, ctx);
        if (name === "fetch_content") return (args: any, theme: any, ctx: any) => renderFetchContentCall(args, theme, ctx);
        if (name === "get_search_content") return (args: any, theme: any, ctx: any) => renderGetSearchContentCall(args, theme, ctx);
      }
      const label = this.toolDefinition?.label ?? name;
      return (args: any, theme: any, ctx: any) => renderMcpCall(label, args, theme, ctx);
    };

    const originalGetResultRenderer = toolProto.getResultRenderer;
    toolProto.getResultRenderer = function patchedGetResultRenderer() {
      const name = this.toolName;
      const base = BASE_RENDERERS[name];
      if (base) return (result: any, options: any, theme: any, ctx: any) => base.result(result, options, theme, ctx);

      const renderer = originalGetResultRenderer.call(this);
      if (renderer !== undefined) return renderer;
      if (WEB_TOOLS.has(name)) {
        if (name === "web_search") return (result: any, options: any, theme: any, ctx: any) => renderWebSearchResult(result, options, theme, ctx);
        if (name === "fetch_content") return (result: any, options: any, theme: any, ctx: any) => renderFetchContentResult(result, options, theme, ctx);
        if (name === "get_search_content") return (result: any, options: any, theme: any, ctx: any) => renderGetSearchContentResult(result, options, theme, ctx);
      }
      const label = this.toolDefinition?.label ?? name;
      return (result: any, options: any, theme: any, ctx: any) => renderMcpResult(label, result, options, theme, ctx);
    };

    // Base tools (e.g. edit) may declare renderShell: "self" on their built-in
    // definition — force "default" so they render through contentBox, where
    // our padding/background patch above applies.
    const originalGetRenderShell = toolProto.getRenderShell;
    toolProto.getRenderShell = function patchedGetRenderShell() {
      if (BASE_RENDERERS[this.toolName]) return "default";
      return originalGetRenderShell.call(this);
    };

    toolProto[PATCH_FLAG] = true;
  }

  // --- Patch SkillInvocationMessageComponent ---
  const skillProto = SkillInvocationMessageComponent.prototype as any;
  if (!skillProto[PATCH_FLAG]) {
    skillProto.updateDisplay = function patchedSkillUpdateDisplay() {
      if (!this.skillBlock) return;

      if (!this._styledSkillComponent) {
        this._styledSkillComponent = createSkillInvocationMessage(
          this.skillBlock.name,
          this.skillBlock.content,
          this.markdownTheme,
        );
      }

      // Strip Box padding — our component handles its own layout
      this.paddingX = 0;
      this.paddingY = 0;
      if (CONFIG.tools.general.isThemeBackgroundVisible) {
        this.bgFn = (text: string) => currentTheme!.bg("customMessageBg", text);
      } else {
        this.bgFn = undefined;
      }

      this._styledSkillComponent.setExpanded(this.expanded);
      this.clear();
      this.addChild(this._styledSkillComponent);
    };

    skillProto[PATCH_FLAG] = true;
  }

  // --- Patch CustomMessageComponent ---
  const customProto = CustomMessageComponent.prototype as any;
  if (!customProto[PATCH_FLAG]) {
    customProto.rebuild = function patchedCustomRebuild() {
      // Extract text content from message
      let textContent: string;
      if (typeof this.message.content === "string") {
        textContent = this.message.content;
      } else {
        textContent = this.message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      }

      // Create styled custom message component
      this._styledCustomComponent = createCustomMessage(
        this.message.customType,
        textContent,
        this.message.details,
        this.markdownTheme,
      );

      // Strip Box padding — our component handles its own layout
      this.paddingX = 0;
      this.paddingY = 0;
      if (CONFIG.tools.general.isThemeBackgroundVisible) {
        this.bgFn = (text: string) => currentTheme!.bg("customMessageBg", text);
      } else {
        this.bgFn = undefined;
      }

      this._styledCustomComponent.setExpanded(this._expanded);
      this.clear();
      this.addChild(this._styledCustomComponent);
    };

    const originalSetExpanded = customProto.setExpanded;
    customProto.setExpanded = function patchedCustomSetExpanded(expanded: boolean) {
      if (this._styledCustomComponent) {
        this._styledCustomComponent.setExpanded(expanded);
      }
      return originalSetExpanded.call(this, expanded);
    };

    customProto[PATCH_FLAG] = true;
  }

  // --- Patch BashExecutionComponent (! / !! commands) ---
  const bashExecProto = BashExecutionComponent.prototype as any;
  if (!bashExecProto[PATCH_FLAG]) {
    const SPINNER_CHARS = CONFIG.tools.toolSpinnerPrefix.prefixChars;
    const SPINNER_FRAMES = [...SPINNER_CHARS, ...[...SPINNER_CHARS].reverse()];
    const SPINNER_INTERVAL = 80;

    // Module-level state: user_bash fires before component construction,
    // and constructor patching via prototype.constructor doesn't work with ES6 classes
    let lastBashExcludeFromContext = false;

    pi.on("user_bash", async (event: any, _ctx: any) => {
      lastBashExcludeFromContext = event.excludeFromContext;
    });

    // Patch render to call updateDisplay first — ensures styled output from
    // the very first frame (not the original bordered layout). Needed because
    // updateDisplay is otherwise only triggered by appendOutput, meaning
    // commands like `! sleep 5 && echo "test"` show unstyled for 5s.
    const origRender = bashExecProto.render;
    bashExecProto.render = function patchedRender(width: number) {
      this.updateDisplay();
      return origRender.call(this, width);
    };

    // Replace updateDisplay with styled version matching tool call pattern
    bashExecProto.updateDisplay = function patchedBashUpdateDisplay() {
      const t = currentTheme!;
      const bc = CONFIG.bashExecution;
      const tc = CONFIG.tools;

      // First-run: remove borders, stop loader, start spinner
      if (!this._styledInitDone) {
        // Remove borders + spacer from original constructor (children layout: Spacer, DynamicBorder, contentContainer, DynamicBorder)
        this.children.splice(this.children.length - 1, 1); // bottom border
        this.children.splice(1, 1);                        // top border
        this.children.splice(0, 1);                        // spacer

        // Stop original loader — we render our own status line
        this.loader.stop();

        // Store TUI ref for requestRender in spinner (Loader had it but we stopped it)
        this._tui = (this.loader as any).ui;

        // Capture excludeFromContext per-instance — module-level variable
        // changes on next command and would flip titles of previous components
        this._excludeFromContext = lastBashExcludeFromContext;

        // Start header spinner
        this._spinnerFrame = 0;
        this._spinnerInterval = setInterval(() => {
          this._spinnerFrame = (this._spinnerFrame + 1) % SPINNER_FRAMES.length;
          this.updateDisplay();
          this._tui?.requestRender();
        }, SPINNER_INTERVAL);

        this._styledInitDone = true;
      }

      // Truncation
      const fullOutput = (this.outputLines as string[]).join("\n");
      const contextTruncation = truncateTail(fullOutput, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
      const availableLines = contextTruncation.content ? contextTruncation.content.split("\n") : [];
      const nonEmptyLines = availableLines.filter((l: string) => l.trim().length > 0);

      // Rebuild content container
      const cc = this.contentContainer as any;
      cc.clear();

      // --- Header: <prefix-icon> <Command|Shell> <dim-command> ---
      const typeLabel = this._excludeFromContext ? "Shell" : "Command";
      const labelText = applyColor(t, bc.titleColor, t.bold(typeLabel));
      const cmdText = applyColor(t, tc.general.summaryColor, ` ${this.command}`);

      let headerLine: string;
      if (this.status === "running") {
        const frame = (this._spinnerFrame as number) ?? 0;
        const spinnerChar = applyColor(t, tc.toolSpinnerPrefix.color, SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
        headerLine = `${spinnerChar} ${labelText}${cmdText}`;
      } else if (this.status === "complete") {
        headerLine = `${toolPrefix(t)}${labelText}${cmdText}`;
      } else {
        headerLine = `${errorPrefix(t)}${labelText}${cmdText}`;
      }

      // --- Status footer ---
      let statusLine: string;
      if (this.status === "running") {
        statusLine = branchLine(
          applyColor(t, tc.general.outputColor, "Running..."),
          t
        );
      } else if (this.status === "cancelled") {
        statusLine = branchLine(applyColor(t, tc.toolError.labelColor, "Cancelled"), t);
      } else if (this.status === "error") {
        statusLine = errorLabel(t);
        if (!this.expanded && nonEmptyLines.length > 0) {
          statusLine += expandHint(t);
        }
      } else {
        const count = nonEmptyLines.length > 0
          ? { label: "lines" as const, value: nonEmptyLines.length }
          : undefined;
        const done = doneLabel(t, count);
        statusLine = (!this.expanded && nonEmptyLines.length > 0) ? done + expandHint(t) : done;
      }

      // --- Assemble: header, then status, then output (if expanded) ---
      let display = "\n" + headerLine + "\n" + statusLine;

      if (this.expanded && nonEmptyLines.length > 0) {
        const styled = nonEmptyLines.map((l: string) => applyColor(t, tc.general.outputColor, l));
        display += formatExpandedLines(styled, "tail", t);
      }

      // Truncation warning
      const wasTruncated = (this.truncationResult as any)?.truncated || contextTruncation.truncated;
      if (wasTruncated && this.fullOutputPath) {
        display += "\n" + branchLine(
          applyColor(t, tc.toolError.labelColor, `Output truncated. Full output: ${this.fullOutputPath}`),
          t
        );
      }

      cc.addChild(new Text(display, 1, 0));
    };

    // Patch setComplete to clear spinner
    const OrigSetComplete = bashExecProto.setComplete;
    bashExecProto.setComplete = function patchedSetComplete(exitCode: any, cancelled: any, truncationResult: any, fullOutputPath: any) {
      if (this._spinnerInterval) {
        clearInterval(this._spinnerInterval);
        this._spinnerInterval = undefined;
      }
      OrigSetComplete.call(this, exitCode, cancelled, truncationResult, fullOutputPath);
    };

    bashExecProto[PATCH_FLAG] = true;
  }

}