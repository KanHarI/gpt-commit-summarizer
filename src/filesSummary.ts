import { octokit } from './octokit'
import { PayloadRepository } from '@actions/github/lib/interfaces'

async function getReviewComment (pullRequestNumber: number, repository: PayloadRepository): Promise<void> {
  const reviewComments = await octokit.pulls.listReviewComments({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullRequestNumber
  })
  console.log(reviewComments)
}

export async function getFilesSummaries (pullNumber: number,
  repository: PayloadRepository): Promise<Record<string, [string, string]>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  const modifiedFiles: Record<string, [string, string]> = {}
  for (const file of filesChanged.data) {
    modifiedFiles[file.filename] = [file.sha, file.patch ?? '']
  }
  await getReviewComment(pullNumber, repository)
  return modifiedFiles
}
