import { context } from "@actions/github";

import { summarizeCommits } from "./commitSummary";
import { getFilesSummaries } from "./filesSummary";

async function run(): Promise<void> {
  // Get the pull request number and repository owner and name from the context object
  const { number } = context.payload.pull_request as {
    number: number;
  };
  const issueNumber = number;
  const { repository } = context.payload;

  if (repository === undefined) {
    throw new Error("Repository undefined");
  }

  // Create a dictionary with the modified files being keys, and the hash values of the latest commits in which the file was modified being the values
  const modifiedFilesSummaries = await getFilesSummaries(
    issueNumber,
    repository
  );

  console.log("Changed Files: ", modifiedFilesSummaries);

  const commitSummaries = await summarizeCommits(
    issueNumber,
    repository,
    modifiedFilesSummaries
  );
  console.log(commitSummaries);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
