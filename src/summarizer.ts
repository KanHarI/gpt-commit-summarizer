import type { PayloadRepository } from "@actions/github/lib/interfaces";

import { summarizeCommits } from "./commitSummary";
import { getFilesSummaries } from "./filesSummary";

export async function summarizeCommitsToPr(
  issueNumber: number,
  repository: PayloadRepository,
  ignoredFiles: string,
  srcFiles: string,
  createFileComments: boolean,
  outputAsComment: boolean
): Promise<string> {
  // Create a dictionary with the modified files being keys, and the hash values of the latest commits in which the file was modified being the values
  const modifiedFilesSummaries = await getFilesSummaries(
    issueNumber,
    repository,
    ignoredFiles,
    srcFiles,
    createFileComments
  );

  return await summarizeCommits(
    issueNumber,
    repository,
    modifiedFilesSummaries,
    createFileComments,
    outputAsComment
  );
}
