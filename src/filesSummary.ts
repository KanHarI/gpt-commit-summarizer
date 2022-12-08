import { octokit } from './octokit'

// Get list of files changed between the base and the end of the pull request
export async function getFilesSummaries (pullNumber: number,
  repository: { owner: { login: string }, name: string }): Promise<Record<string, [string, string]>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  const modifiedFiles: Record<string, [string, string]> = {}
  const diff = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  for (const file of filesChanged.data) {
    modifiedFiles[file.filename] = [file.sha, diff.data.diff_url]
  }
  return modifiedFiles
}
