import { octokit } from './octokit'

// Get list of files changed between the base and the end of the pull request
export async function getFilesSummaries (issueNumber: number,
  repository: { owner: { login: string }, name: string }): Promise<Record<string, string>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: issueNumber
  })
  const modifiedFiles: Record<string, string> = {}
  filesChanged.data.forEach((file: any) => {
    modifiedFiles[file.filename] = file.sha
  })
  return modifiedFiles
}
