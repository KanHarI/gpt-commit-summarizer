import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

// Keep track of the SHA hashes for which we have already added a comment
const commentedCommits = new Set<string>()

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

  // Get the list of diffs for the pull request
  const diffs = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })

  // For each commit, get the list of files that were modified
  const commits = await octokit.pulls.listCommits({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })

  for (const commit of commits.data) {
    // Skip this commit if we have already added a comment for it
    if (commentedCommits.has(commit.sha)) {
      continue
    }

    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}: `
    const regex = new RegExp(`^${expectedComment}.*$`)
    const existingComment = comments.data.find((comment) => regex.test(comment.body ?? ''))

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

    // Find the first diff that corresponds to one of the modified files in the commit
    const diff = diffs.data.find((file) => commitObject.data.files?.some((commitFile) => commitFile.filename === file.filename))

    // If no diff is found, skip this commit
    if (diff === undefined) {
      continue
    }

    // Create a comment on the pull request with the names of the files that were modified in the commit
    const comment = `GPT summary of ${commit.sha}: ${commitObject.data.files
      .map((file) => file.filename)
      .join(', ')}`
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: number,
      body: comment,
      in_reply_to: diff.blob_url
    })

    // Add the SHA hash of the commit to the set of commented commits
    commentedCommits.add(commit.sha)
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
