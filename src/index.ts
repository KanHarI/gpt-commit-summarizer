import { getInput } from "@actions/core";
import { context } from "@actions/github";

import { octokit } from "./octokit";
import { summarizeCommitsToPr } from "./summarizer";
import { summarizeRelease } from "./summarizeRelease";
import { setProject } from "./vertexAi";

async function run(): Promise<void> {
  // Get the repository owner and name from the context object
  const { repository } = context.payload;

  if (repository === undefined) {
    throw new Error("Repository undefined");
  }
  const project = getInput("project");
  setProject(project);
  const forceRelease = getInput("release");
  let action = context.payload.action;
  if (forceRelease) {
    console.log(`Running against release ${forceRelease}`);
    action = "released";
    context.payload.release = await octokit.repos.getReleaseByTag({
      owner: repository.owner.login,
      repo: repository.name,
      tag: forceRelease,
    });
  }
  const ignoredFiles = getInput("ignored-files");
  const srcFiles = getInput("src-files");
  const createFileComments = getInput("create-file-comments") == "true";
  const outputAsComment = getInput("pr-summary-as-comment") == "true";
  // Check if we're on a Release
  console.log(`Action: ${action}, event type: ${context.eventName}`);
  if (action === "released" || action === "prereleased" || forceRelease) {
    // Create release notes
    const { release } = context.payload;
    const generateImages = getInput("generate-images") == "true";
    const replaceGeneratedNotes = getInput("replace-generated-notes") == "true";
    await summarizeRelease(
      release,
      repository,
      true,
      generateImages,
      ignoredFiles,
      srcFiles,
      createFileComments,
      outputAsComment,
      replaceGeneratedNotes
    );
  } else if (context.payload.pull_request) {
    // We're on a pull request
    // Get the pull request number from the context object
    const { number } = context.payload.pull_request as {
      number: number;
    };
    const issueNumber = number;
    await summarizeCommitsToPr(
      issueNumber,
      repository,
      ignoredFiles,
      srcFiles,
      createFileComments,
      outputAsComment
    );
  } else {
    console.warn("No pull request or release found, skipping");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
