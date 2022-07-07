/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as eipw from "eipw-lint-js";
import core from "@actions/core";
import github from "@actions/github";

async function main() {
  const result = await eipw.lint(["/tmp/eip-1000.md"]);
  console.log(result);
}

main();
