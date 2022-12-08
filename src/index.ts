import { context } from '@actions/github'

import { summarizeCommits } from './commitSummary'
import { octokit } from './octokit'

async function run (): Promise<void> {
  // Get the pull request number and repository owner and name from the context object
  const {
    number
  } = (context.payload.pull_request as {
    number: number
  })
  const issueNumber = number
  const repository = context.payload.repository

  if (repository === undefined) {
    throw new Error('Repository undefined')
  }
  // Get list of files changed between the base and the end of the pull request
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: issueNumber
  })
  const commitSummaries = await summarizeCommits(issueNumber, repository)
  // Create a dictionary with the modified files being keys, and the hash values of the latest commits in which the file was modified being the values
  const modifiedFiles: Record<string, string> = {}
  filesChanged.data.forEach((file: any) => {
    modifiedFiles[file.filename] = file.sha
  })
  console.log('Changed Files: ', modifiedFiles)
  console.log(commitSummaries)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
