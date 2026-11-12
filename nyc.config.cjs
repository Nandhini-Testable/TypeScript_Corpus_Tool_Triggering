"use strict";
/* Root-level nyc config. nyc only auto-discovers a config in the working
 * directory, so a bare `nyc mocha` from the repo root ran with defaults,
 * instrumented nothing and wrote an all-zero, 'Unknown' summary with an empty
 * coverage-final.json. The real settings stay in one place; this file just
 * re-exports them. */
module.exports = require("./Tool Triggering (Synthetic Data)/nyc/.nycrc.json");
