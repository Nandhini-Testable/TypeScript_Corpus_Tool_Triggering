"use strict";
/* Root-level mocha config. mocha (and nyc/c8 wrapping it) only auto-discovers
 * a config in the working directory, so a bare `mocha` / `nyc mocha` run from
 * the repo root found none: "No test files found" and 0% coverage everywhere.
 * The real settings stay in one place; this file just re-exports them. */
module.exports = require("./Tool Triggering (Synthetic Data)/mocha/.mocharc.cjs");
