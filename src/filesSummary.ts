import { octokit } from './octokit'
import { PayloadRepository } from '@actions/github/lib/interfaces'
import { SHARED_PROMPT } from './sharedPrompt'

const OPEN_AI_PROMPT = `${SHARED_PROMPT}
`

async function getReviewComments (pullRequestNumber: number, repository: PayloadRepository): Promise<Array<{ body: string }>> {
  const reviewComments = (await octokit.paginate(octokit.pulls.listReviewComments, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullRequestNumber
  }) as unknown as Awaited<ReturnType<typeof octokit.pulls.listReviewComments>>)
  console.log('reviewComments:\n', reviewComments)
  return reviewComments.data
}

export async function getFilesSummaries (pullNumber: number,
  repository: PayloadRepository): Promise<Record<string, string>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  const modifiedFiles: Record<string, { sha: string, diff: string }> = {}
  for (const file of filesChanged.data) {
    modifiedFiles[file.filename] = { sha: file.sha, diff: file.patch ?? '' }
  }
  const existingReviewSummaries = await getReviewComments(pullNumber, repository)
  const result: Record<string, string> = {}
  for (const modifiedFile of Object.keys(modifiedFiles)) {
    let isFileAlreadySummarized = false
    const expectedComment = `GPT summary of ${modifiedFiles[modifiedFile].sha}:`
    for (const reviewSummary of existingReviewSummaries) {
      if (reviewSummary.body?.includes(expectedComment)) {
        const summary = reviewSummary.body?.split('\n').slice(1).join('\n')
        result[modifiedFile] = summary
        isFileAlreadySummarized = true
        break
      }
    }
    if (isFileAlreadySummarized) {
      continue
    }
    console.log(OPEN_AI_PROMPT)
    return result
  }
}
