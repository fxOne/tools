#!/usr/bin/env node
import { runCli } from './cli.js';

process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stderr: process.stderr,
  stdout: process.stdout,
});
