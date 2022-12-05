import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

async function run (): Promise<void> {
  // Get the pull request number and repository owner and name from the context object
  const {
    number
  } = (context.payload.pull_request as {
    number: number
  })
  const repository = context.payload.repository

  if (repository === undefined) {
    throw new Error('Repository undefined')
  }

  // Get the list of existing comments for the pull request
  const comments = await octokit.issues.listComments({
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: number
  })

  // Get the list of commits for the pull request
  const commits = await octokit.pulls.listCommits({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })

  // For each commit, get the list of files that were modified
  for (const commit of commits.data) {
    // Check whether a comment already exists for the commit
    const existingComment = comments.data.find(
      (comment) => comment.body?.startsWith(`Files modified in commit ${commit.sha}:`)
    )

    // If a comment already exists, skip this commit
    if (existingComment !== undefined) {
      continue
    }

    // Get the commit object with the list of files that were modified
    const commitObject = await octokit.repos.getCommit({
      owner: repository.owner.login,
      repo: repository.name,
      ref: commit.sha
    })

    if (commitObject.data.files === undefined) {
      throw new Error('Files undefined')
    }

    // Create a comment on the pull request with the names of the files that were modified in the commit
    const comment = `Files modified in commit ${commit.sha}: ${commitObject.data.files
      .map((file) => file.filename)
      .join(', ')}`
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: number,
      body: comment
    })
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
