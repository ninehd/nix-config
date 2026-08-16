#!/usr/bin/env node

const fs = require("node:fs");

function usage(exitCode = 1) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(`usage: node wait.ts <session.jsonl> [--count n] [--timeout seconds] [--poll milliseconds]\n`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage(0);

let file = undefined;
let count = 1;
let timeoutSeconds = 1800;
let pollMilliseconds = 500;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--count") {
    count = Number(args[++i]);
  } else if (arg === "--timeout") {
    timeoutSeconds = Number(args[++i]);
  } else if (arg === "--poll") {
    pollMilliseconds = Number(args[++i]);
  } else if (!file) {
    file = arg;
  } else {
    usage();
  }
}

if (!file || !Number.isInteger(count) || count < 1 || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || !Number.isFinite(pollMilliseconds) || pollMilliseconds <= 0) {
  usage();
}

const deadline = Date.now() + timeoutSeconds * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRecords(path) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }

  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Ignore a partial line while Pi is still writing.
    }
  }
  return records;
}

function activeBranch(records) {
  const byId = new Map();
  for (const record of records) {
    if (record && typeof record.id === "string") byId.set(record.id, record);
  }

  const leaf = [...records].reverse().find((record) => record && typeof record.id === "string");
  if (!leaf) return new Set();

  const branch = new Set();
  let current = leaf;
  while (current && typeof current.id === "string" && !branch.has(current.id)) {
    branch.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return branch;
}

function latestTerminalAssistant(records) {
  const branch = activeBranch(records);
  if (branch.size === 0) return undefined;

  const messages = records.filter((record) => record && record.type === "message" && branch.has(record.id));
  const latestMessage = [...messages].reverse()[0];
  if (!latestMessage) return undefined;

  const message = latestMessage.message || {};
  if (message.role !== "assistant" || !message.stopReason) return undefined;

  const terminalAssistants = messages.filter((record) => {
    const msg = record.message || {};
    return msg.role === "assistant" && Boolean(msg.stopReason);
  });

  return terminalAssistants.slice(-count);
}

async function main() {
  let lastError;
  while (Date.now() <= deadline) {
    try {
      const records = readRecords(file);
      const result = latestTerminalAssistant(records);
      if (result && result.length > 0) {
        process.stdout.write(JSON.stringify(count === 1 ? result[result.length - 1] : result, null, 2));
        process.stdout.write("\n");
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(pollMilliseconds);
  }

  if (lastError) {
    process.stderr.write(`session did not settle before timeout; last error: ${lastError.message}\n`);
  } else {
    process.stderr.write("session did not settle before timeout\n");
  }
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
});
