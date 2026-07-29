#!/usr/bin/env node

import { reportCliError, runCli } from "./cli/main.js";

runCli().catch((error: unknown) => {
  reportCliError(error);
  process.exitCode = 1;
});
