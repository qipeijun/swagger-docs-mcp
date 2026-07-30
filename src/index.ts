#!/usr/bin/env node

import { reportCliError, runCli } from "./cli/main.js";

const args = process.argv.slice(2);

runCli(args).catch((error: unknown) => {
  const jsonError = args[0] === "doctor" && args.includes("--json");
  reportCliError(error, jsonError);
  process.exitCode = 1;
});
