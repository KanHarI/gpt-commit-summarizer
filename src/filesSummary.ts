import type { PayloadRepository } from "@actions/github/lib/interfaces";
// hybrid module, load with require() or import
import { minimatch } from "minimatch";

import { octokit } from "./octokit";
import { SHARED_PROMPT } from "./sharedPrompt";
import { predict } from "./vertexAi";

const linkRegex =
  /\[(?:[a-f0-9]{6}|None)\]\(https:\/\/github\.com\/.*?#([a-f0-9]{40}|None)\)/;

export function preprocessCommitMessage(commitMessage: string): string {
  let match = commitMessage.match(linkRegex);
  while (match !== null) {
    commitMessage = commitMessage.split(match[0]).join(match[1]);
    match = commitMessage.match(linkRegex);
  }
  return commitMessage;
}

const OPEN_AI_PROMPT = `${SHARED_PROMPT}
The following is a git diff of a single file.
Please summarize it in a comment, describing the changes made in the diff in high level.
Do it in the following way:
Write \`SUMMARY:\` and then write a summary of the changes made in the diff, as a bullet point list.
Every bullet point should start with a \`*\`.
`;

const MAX_FILES_TO_SUMMARIZE = 20;

export async function getOpenAISummaryForFile(
  filename: string,
  patch: string
): Promise<string> {
  try {
    if (!patch) {
      return "";
    }
    const openAIPrompt = `${OPEN_AI_PROMPT}\n\nTHE GIT DIFF OF ${filename} TO BE SUMMARIZED:\n\`\`\`\n`;
    console.log(`Requesting AI file summary for ${filename}`);

    const response = await predict(
      openAIPrompt,
      patch,
      `\n\`\`\`\n\nSUMMARY:\n`
    );
    return response ?? `Error: couldn't generate summary for file ${filename}`;
  } catch (error) {
    console.error(error);
  }
  return `Error: couldn't generate summary for file ${filename}`;
}

async function getReviewComments(
  pullRequestNumber: number,
  repository: PayloadRepository
): Promise<Array<[string, number]>> {
  const reviewComments = (await octokit.paginate(
    octokit.pulls.listReviewComments,
    {
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pullRequestNumber,
    }
  )) as unknown as Awaited<ReturnType<typeof octokit.pulls.listReviewComments>>;
  return (
    reviewComments as unknown as Array<{ body?: string; id: number }>
  ).map((reviewComment) => [
    preprocessCommitMessage(reviewComment.body ?? ""),
    reviewComment.id,
  ]);
}

export async function getFilesSummariesForCommit(
  sha: string,
  repository: PayloadRepository,
  ignoredFilesGlob: string = "",
  onlyFilesFrom: string = ""
): Promise<Record<string, string>> {
  const commit = await octokit.repos.getCommit({
    owner: repository.owner.login,
    repo: repository.name,
    ref: sha,
  });
  if (!commit.data.files) {
    return {};
  }
  const modifiedFiles: Record<
    string,
    {
      sha: string;
      diff: string;
      position: number;
      filename: string;
    }
  > = {};
  for (const file of commit.data.files) {
    let skip = false;
    for (const ignoredFile of ignoredFilesGlob.split(",")) {
      if (minimatch(file.filename, ignoredFile)) {
        skip = true;
        break;
      }
    }
    for (const onlyFile of onlyFilesFrom.split(",")) {
      if (minimatch(file.filename, onlyFile)) {
        skip = false;
        break;
      }
      skip = true;
    }
    if (skip) {
      continue;
    }

    const firstModifiedLineAfterCommit =
      Number(file.patch?.split("+")[1]?.split(",")[0]) ?? 0;
    modifiedFiles[file.filename] = {
      sha: file.sha,
      diff: file.patch ?? "",
      position: firstModifiedLineAfterCommit,
      filename: file.filename,
    };
  }
  const result: Record<string, string> = {};
  let summarizedFiles = 0;
  for (const modifiedFile of Object.keys(modifiedFiles)) {
    if (modifiedFiles[modifiedFile].diff === "") {
      // Binary file
      continue;
    }
    const fileAnalysisAndSummary = await getOpenAISummaryForFile(
      modifiedFile,
      modifiedFiles[modifiedFile].diff
    );
    if (!fileAnalysisAndSummary) {
      continue;
    }
    result[modifiedFile] = fileAnalysisAndSummary;
    summarizedFiles += 1;
    if (summarizedFiles >= MAX_FILES_TO_SUMMARIZE) {
      break;
    }
  }
  return result;
}

export async function getFilesSummaries(
  pullNumber: number,
  repository: PayloadRepository,
  ignoredFilesGlob: string = "",
  onlyFilesFrom: string = "",
  createFileComments: boolean = false
): Promise<Record<string, string>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });
  const pullRequest = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber,
  });
  const baseCommitSha = pullRequest.data.base.sha;
  const headCommitSha = pullRequest.data.head.sha;
  const baseCommitTree = await octokit.git.getTree({
    owner: repository.owner.login,
    repo: repository.name,
    tree_sha: baseCommitSha,
    recursive: "true",
  });
  const modifiedFiles: Record<
    string,
    {
      sha: string;
      originSha: string;
      diff: string;
      position: number;
      filename: string;
    }
  > = {};
  for (const file of filesChanged.data) {
    let skip = false;
    if (ignoredFilesGlob) {
      for (const ignoredFile of ignoredFilesGlob.split(",")) {
        if (minimatch(file.filename, ignoredFile)) {
          skip = true;
          break;
        }
      }
    }
    if (onlyFilesFrom)
      for (const onlyFile of onlyFilesFrom.split(",")) {
        if (minimatch(file.filename, onlyFile)) {
          skip = false;
          break;
        }
        skip = true;
      }
    if (skip) {
      continue;
    }
    const originSha =
      baseCommitTree.data.tree.find((tree: any) => tree.path === file.filename)
        ?.sha ?? "None";
    const firstModifiedLineAfterCommit =
      Number(file.patch?.split("+")[1]?.split(",")[0]) ?? 0;
    modifiedFiles[file.filename] = {
      sha: file.sha,
      originSha,
      diff: file.patch ?? "",
      position: firstModifiedLineAfterCommit,
      filename: file.filename,
    };
  }
  let existingReviewSummaries: [string, number][] = [];
  if (createFileComments) {
    existingReviewSummaries = (
      await getReviewComments(pullNumber, repository)
    ).filter((comment) => comment[0].startsWith("GPT summary of"));
    let commentIdsToDelete = [...existingReviewSummaries];
    for (const modifiedFile of Object.keys(modifiedFiles)) {
      const expectedComment = `GPT summary of ${modifiedFiles[modifiedFile].originSha} - ${modifiedFiles[modifiedFile].sha}:`;
      commentIdsToDelete = commentIdsToDelete.filter(
        ([comment]) => !comment.includes(expectedComment)
      );
    }
    for (const [, id] of commentIdsToDelete) {
      await octokit.pulls.deleteReviewComment({
        owner: repository.owner.login,
        repo: repository.name,
        comment_id: id,
      });
    }
  }
  const result: Record<string, string> = {};
  let summarizedFiles = 0;
  for (const modifiedFile of Object.keys(modifiedFiles)) {
    if (modifiedFiles[modifiedFile].diff === "") {
      // Binary file
      continue;
    }
    let isFileAlreadySummarized = false;
    const expectedComment = `GPT summary of ${modifiedFiles[modifiedFile].originSha} - ${modifiedFiles[modifiedFile].sha}:`;
    for (const reviewSummary of existingReviewSummaries) {
      if (reviewSummary[0].includes(expectedComment)) {
        const summary = reviewSummary[0].split("\n").slice(1).join("\n");
        result[modifiedFile] = summary;
        isFileAlreadySummarized = true;
        break;
      }
    }
    if (isFileAlreadySummarized) {
      continue;
    }
    const fileAnalysisAndSummary = await getOpenAISummaryForFile(
      modifiedFile,
      modifiedFiles[modifiedFile].diff
    );
    if (!fileAnalysisAndSummary) {
      continue;
    }
    result[modifiedFile] = fileAnalysisAndSummary;
    if (!createFileComments) {
      continue;
    }
    const comment = `GPT summary of [${modifiedFiles[
      modifiedFile
    ].originSha.slice(0, 6)}](https://github.com/${repository.owner.login}/${
      repository.name
    }/blob/${baseCommitSha}/${modifiedFile}#${
      modifiedFiles[modifiedFile].originSha
    }) - [${modifiedFiles[modifiedFile].sha.slice(0, 6)}](https://github.com/${
      repository.owner.login
    }/${repository.name}/blob/${headCommitSha}/${modifiedFile}#${
      modifiedFiles[modifiedFile].sha
    }):\n${fileAnalysisAndSummary}`;
    console.log(
      `Adding comment to line ${modifiedFiles[modifiedFile].position}`
    );
    await octokit.pulls.createReviewComment({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pullNumber,
      commit_id: headCommitSha,
      path: modifiedFiles[modifiedFile].filename,
      line: Number.isFinite(modifiedFiles[modifiedFile].position)
        ? modifiedFiles[modifiedFile].position > 0
          ? modifiedFiles[modifiedFile].position
          : 1
        : 1,
      side:
        modifiedFiles[modifiedFile].position > 0 ||
        modifiedFiles[modifiedFile].originSha === "None"
          ? "RIGHT"
          : "LEFT",
      body: comment,
    });
    summarizedFiles += 1;
    if (summarizedFiles >= MAX_FILES_TO_SUMMARIZE) {
      break;
    }
  }
  return result;
}
