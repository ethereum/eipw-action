/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import * as eipw from "eipw-lint-js";
import core from "@actions/core";
import github from "@actions/github";
async function main() {
    var _a, _b, _c, _d;
    try {
        const githubToken = core.getInput("token");
        const octokit = github.getOctokit(githubToken);
        const context = github.context;
        switch (context.eventName) {
            case "pull_request":
            case "pull_request_target":
                break;
            default:
                core.warning("eipw-action should only be configured to run on pull requests");
                return;
        }
        const uncheckedText = core.getInput("unchecked") || "";
        const unchecked = [];
        for (let item of uncheckedText.split(",")) {
            unchecked.push(`eip-${item.trim()}.md`);
        }
        const pull_event = context.payload;
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
                if (status === "removed") {
                    // Don't consider deleted files.
                    continue;
                }
                if (!filename.startsWith("EIPS/")) {
                    // Only check files in the `EIPS/` directory.
                    continue;
                }
                if (unchecked.some(i => filename.endsWith(i))) {
                    // Don't check certain files, as defined in the workflow.
                    continue;
                }
                files.push(filename);
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
            }
            catch (_e) {
                // FIXME: This happens when there's an escape sequence in the JSON.
                //        serde_json can't deserialize it into an &str, so we display
                //        what we can.
                formatted = (_a = snippet.title) === null || _a === void 0 ? void 0 : _a.label;
                if (!formatted) {
                    formatted = "<failed to render diagnostic, this is a bug in eipw>";
                }
            }
            let lineNumber = null;
            let file = null;
            if (((_b = snippet.slices) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                lineNumber = snippet.slices[0].line_start;
                file = snippet.slices[0].origin;
            }
            const properties = {
                title: (_c = snippet.title) === null || _c === void 0 ? void 0 : _c.label,
                startLine: lineNumber,
                file: file,
            };
            switch ((_d = snippet.title) === null || _d === void 0 ? void 0 : _d.annotation_type) {
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
    }
    catch (error) {
        console.log(error);
        let msg = "failed";
        if (error instanceof Error) {
            msg = error.message;
        }
        core.setFailed(msg);
    }
}
main();
