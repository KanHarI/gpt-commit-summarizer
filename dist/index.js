"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const rest_1 = require("@octokit/rest");
const github_1 = require("@actions/github");
const octokit = new rest_1.Octokit();
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get the pull request number and repository owner and name from the context object
        const { number, repository } = github_1.context.payload.pull_request;
        const { owner, repo } = repository;
        // Get the list of commits for the pull request
        const commits = yield octokit.pulls.listCommits({
            owner,
            repo,
            pull_number: number
        });
        // For each commit, get the list of files that were modified
        for (const commit of commits.data) {
            const files = (yield octokit.pulls.listFiles({
                owner,
                repo,
                pull_number: number,
                commit_sha: commit.sha
            })).data;
            // Create a comment on the pull request with the names of the files that were modified in the commit
            const comment = `Files modified in commit ${commit.sha}: ${files
                .map((file) => file.filename)
                .join(', ')}`;
            yield octokit.issues.createComment({
                owner,
                repo,
                issue_number: number,
                body: comment
            });
        }
    });
}
