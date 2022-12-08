import { context } from '@actions/github'

import { summarizeCommits } from './commitSummary'

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
  const commitSummaries = await summarizeCommits(issueNumber, repository)
  console.log(commitSummaries)
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
