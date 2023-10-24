import type { gitDiffMetadata } from "./DiffMetadata";
import { octokit } from "./octokit";
import {
  MAX_OPEN_AI_QUERY_LENGTH,
  MAX_TOKENS,
  MODEL_NAME,
  openai,
  TEMPERATURE,
} from "./openAi";
import { SHARED_PROMPT } from "./sharedPrompt";
import { summarizePr } from "./summarizePr";
import { shouldIgnoreFile } from "./ignoreFiles";

const OPEN_AI_PRIMING = `${SHARED_PROMPT}
After the git diff of the first file, there will be an empty line, and then the git diff of the next file. 

For comments that refer to 1 or 2 modified files,
add the file names as [path/to/modified/python/file.py], [path/to/another/file.json]
at the end of the comment.
If there are more than two, do not include the file names in this way.
Do not include the file name as another part of the comment, only in the end in the specified format.
Do not use the characters \`[\` or \`]\` in the summary for other purposes.
Write every summary comment in a new line.
Comments should be in a bullet point list, each line starting with a \`*\`.
The summary should only include non-obvious changes.
The summary should not include comments copied from the code.
The summary should not include comments about the code style, formatting and linting.
The summary must ignore whitespace changes.
The output should be easily readable. When in doubt, write less comments and not more.
Readability is top priority. Write only the most important comments about the diff.

EXAMPLES OF SUMMARY COMMENTS:

Example 1:
\`\`\`
* Raised the amount of returned recordings from \`10\` to \`100\` [packages/server/recordings_api.ts], [packages/server/constants.ts]
* Fixed a typo in the github action name [.github/workflows/gpt-commit-summarizer.yml]
\`\`\`

Example 2:
\`\`\`
* Added XLSX export support [packages/server/exports/xlsx.ts]
\`\`\`

Example 3:
\`\`\`
* Moved the \`octokit\` initialization to a separate file [src/octokit.ts], [src/index.ts]
* Added an OpenAI API for completions [packages/utils/apis/openai.ts]
* Lowered numeric tolerance for test files
\`\`\`

Only comment about the most important changes.
The last comment does not include the file names because there were more than two relevant files in the hypothetical commit.
Do not include parts of the examples in your summary.
It is given only as an example of appropriate comments.
`;

const MAX_COMMITS_TO_SUMMARIZE = 20;

function formatGitDiff(filename: string, patch: string): string {
  const result = [];
  result.push(`--- a/${filename}`);
  result.push(`+++ b/${filename}`);
  for (const line of patch.split("\n")) {
    result.push(line);
  }
  result.push("");
  return result.join("\n");
}

function postprocessSummary(
  filesList: string[],
  summary: string,
  diffMetadata: gitDiffMetadata
): string {
  for (const fileName of filesList) {
    const splitFileName = fileName.split("/");
    const shortName = splitFileName[splitFileName.length - 1];
    const link =
      "https://github.com/" +
      `${diffMetadata.repository.owner.login}/` +
      `${diffMetadata.repository.name}/blob/` +
      `${diffMetadata.commit.data.sha}/` +
      `${fileName}`;
    summary = summary.split(`[${fileName}]`).join(`[${shortName}](${link})`);
  }
  return summary;
}

async function getOpenAICompletion(
  comparison: Awaited<ReturnType<typeof octokit.repos.compareCommits>>,
  completion: string,
  diffMetadata: gitDiffMetadata
): Promise<string> {
  try {
    const diffResponse = await octokit.request(comparison.url);
    const files: any[] = diffResponse.data.files.filter((file: any) => !shouldIgnoreFile(file.filename))

    const rawGitDiff = files
      .map((file: any) => formatGitDiff(file.filename, file.patch))
      .join("\n");
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `\n\nTHE GIT DIFF TO BE SUMMARIZED:\n\`\`\`\n${rawGitDiff}\n\`\`\`\n\nTHE SUMMERY:\n`;
    console.log(
      `System prompt for commit ${diffMetadata.commit.data.sha}:\n${OPEN_AI_PRIMING}`
    );
    console.log(
      `User prompt for commit ${diffMetadata.commit.data.sha}: ${openAIPrompt}`
    );

    if (openAIPrompt.length > MAX_OPEN_AI_QUERY_LENGTH) {
      throw new Error("OpenAI query too big");
    }

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: OPEN_AI_PRIMING,
        },
        {
          role: "user",
          content: openAIPrompt,
        },
      ],
    });

    if (response.choices !== undefined && response.choices.length > 0) {
      completion = postprocessSummary(
        files.map((file: any) => file.filename),
        response.choices[0].message.content ??
          "Error: couldn't generate summary",
        diffMetadata
      );
    }
  } catch (error) {
    console.error(error);
  }
  return completion;
}

export async function summarizeCommits(
  pullNumber: number,
  repository: { owner: { login: string }; name: string },
  modifiedFilesSummaries: Record<string, string>
): Promise<Array<[string, string]>> {
  const commitSummaries: Array<[string, string]> = [];

  const pull = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: pullNumber,
  });

  let commitsSummarized = 0;

  // For each commit, get the list of files that were modified
  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });

  const headCommit = pull.data.head.sha;

  let needsToSummarizeHead = false;
  for (const commit of commits) {
    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}:`;
    const regex = new RegExp(`^${expectedComment}.*`);
    const existingComment = comments.find((comment) =>
      regex.test(comment.body ?? "")
    );

    // If a comment already exists, skip this commit
    if (existingComment !== undefined) {
      const currentCommitAbovePrSummary =
        existingComment.body?.split("PR summary so far:")[0] ?? "";
      const summaryLines = currentCommitAbovePrSummary
        .split("\n")
        .slice(1)
        .join("\n");
      commitSummaries.push([commit.sha, summaryLines]);
      continue;
    }

    if (commit.sha === headCommit) {
      needsToSummarizeHead = true;
    }

    // Get the commit object with the list of files that were modified
    const commitObject = await octokit.repos.getCommit({
      owner: repository.owner.login,
      repo: repository.name,
      ref: commit.sha,
    });

    if (commitObject.data.files === undefined) {
      throw new Error("Files undefined");
    }

    const isMergeCommit = commitObject.data.parents.length !== 1;
    const parent = commitObject.data.parents[0].sha;

    const comparison = await octokit.repos.compareCommits({
      owner: repository.owner.login,
      repo: repository.name,
      base: parent,
      head: commit.sha,
    });

    let completion = "Error: couldn't generate summary";
    if (!isMergeCommit) {
      completion = await getOpenAICompletion(comparison, completion, {
        sha: commit.sha,
        issueNumber: pullNumber,
        repository,
        commit: commitObject,
      });
    } else {
      completion = "Not generating summary for merge commits";
    }

    commitSummaries.push([commit.sha, completion]);

    // Create a comment on the pull request with the names of the files that were modified in the commit
    const comment = `GPT summary of ${commit.sha}:\n\n${completion}`;

    if (commit.sha !== headCommit) {
      await octokit.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: pullNumber,
        body: comment,
        commit_id: commit.sha,
      });
    }
    commitsSummarized++;
    if (commitsSummarized >= MAX_COMMITS_TO_SUMMARIZE) {
      console.log(
        "Max commits summarized - if you want to summarize more, rerun the action. This is a protection against spamming the PR with comments"
      );
      break;
    }
  }
  const headCommitShaAndSummary = commitSummaries.find(
    ([sha]) => sha === headCommit
  );
  if (needsToSummarizeHead && headCommitShaAndSummary !== undefined) {
    let prSummary = "Error summarizing PR";
    try {
      prSummary = await summarizePr(modifiedFilesSummaries, commitSummaries);
    } catch (error) {
      console.error(error);
    }
    const comment = `GPT summary of ${headCommit}:\n\n${headCommitShaAndSummary[1]}\n\nPR summary so far:\n\n${prSummary}`;
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pullNumber,
      body: comment,
      commit_id: headCommit,
    });
  }
  return commitSummaries;
}
