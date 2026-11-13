"use strict";
/* Root-level dependency-cruiser config. depcruise only looks for a config at the
 * default location in the working directory, and aborts with "Can't open a config
 * file (.dependency-cruiser.(c|m)js) at the default location" when there is none.
 * A bare `depcruise src` therefore failed from the repo root. The real rules stay
 * in one place; this file just re-exports them. */
module.exports = require("./Tool Triggering (Synthetic Data)/dependency-cruiser/.dependency-cruiser.cjs");
