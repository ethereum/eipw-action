/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as eipw from "eipw-lint-js";
import core from "@actions/core";
import github from "@actions/github";
import { PullRequestEvent } from "@octokit/webhooks-types";

async function main() {
  try {
    const githubToken = core.getInput("token");
    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    if (context.eventName !== "pull_request") {
      core.warning(
        "eipw-action should only be configured to run on pull requests"
      );
      return;
    }

    const pull_event = context.payload as PullRequestEvent;
    const pull = pull_event.pull_request;

    const files = [];

    let fetched;
    let page = 1;
    do {
      let response = await octokit.rest.pulls.listFiles({
        owner: pull.base.repo.owner.login,
        repo: pull.base.repo.name,
        pull_number: pull.number,
        page,
      });

      if (response.status !== 200) {
        core.setFailed(`pulls listFiles ${response.status}`);
        return;
      }

      fetched = response.data;

      for (let entry of fetched) {
        const filename = entry.filename;
        const status = entry.status;

        if (filename.startsWith("EIPS/") && status !== "removed") {
          files.push(filename);
        }
      }

      page += 1;
    } while (fetched.length > 0);

    if (!files.length) {
      core.notice("no files to check");
      return;
    }

    const result = await eipw.lint(files);
    let hasErrors = false;

    for (let snippet of result) {
      let formatted;

      try {
        formatted = eipw.format(snippet);
      } catch {
        // FIXME: This happens when there's an escape sequence in the JSON.
        //        serde_json can't deserialize it into an &str, so we display
        //        what we can.
        formatted = snippet.title?.label;
        if (!formatted) {
          formatted = "<failed to render diagnostic, this is a bug in eipw>";
        }
      }

      let lineNumber = null;
      let file = null;

      if (snippet.slices?.length > 0) {
        lineNumber = snippet.slices[0].line_start;
        file = snippet.slices[0].origin;
      }

      const properties = {
        title: snippet.title?.label,
        startLine: lineNumber,
        file: file,
      };

      switch (snippet.title?.annotation_type) {
        case "Help":
        case "Note":
        case "Info":
          core.notice(formatted, properties);
          break;
        case "Warning":
          core.warning(formatted, properties);
          break;
        case "Error":
        default:
          core.error(formatted, properties);
          hasErrors = true;
          break;
      }
    }

    if (hasErrors) {
      core.setFailed("validation found errors :(");

      const url = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
      const body = `The commit ${pull.head.sha} (as a parent of ${context.sha}) contains errors. Please inspect the [Run Summary](${url}) for details.`;

      octokit.rest.issues.createComment({
        owner: pull.base.repo.owner.login,
        repo: pull.base.repo.name,
        issue_number: pull.number,
        body,
      });
    }
  } catch (error) {
    console.log(error);
    let msg = "failed";
    if (error instanceof Error) {
      msg = error.message;
    }
    core.setFailed(msg);
  }
}

main();
