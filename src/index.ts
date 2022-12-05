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

  // Set the number of comments to return per page
  const perPage = 100

  // Get the list of existing comments for the pull request
  const comments: Awaited<ReturnType<typeof octokit.issues.listComments>>['data'] = []
  let page = 1
  while (true) {
    // Get the current page of comments
    const response = await octokit.issues.listComments({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: number,
      per_page: perPage,
      page
    })

    if (response === undefined) {
      break
    }

    // Add the comments from the current page to the list of comments
    comments.push(...response.data)

    // If there are no more pages of comments, break out of the loop
    if ((response.headers.link?.includes('next')) === false) {
      break
    }

    // Increment the page number
    page++
  }

  console.log(comments)

  // Get the list of diffs for the pull request
  const diffs: Awaited<ReturnType<typeof octokit.pulls.listFiles>>['data'] = []
  page = 1
  while (true) {
    // Get the current page of diffs
    const response = await octokit.pulls.listFiles({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number,
      per_page: perPage,
      page
    })

    if (response === undefined) {
      break
    }

    // Add the diffs from the current page to the list of diffs
    diffs.push(...response.data)

    // If there are no more pages of diffs, break out of the loop
    if ((response.headers.link?.includes('next')) === false) {
      break
    }

    // Increment the page number
    page++
  }

  console.log(diffs)

  // For each commit, get the list of files that were modified
  const commits = await octokit.pulls.listCommits({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })

  for (const commit of commits.data) {
    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}: `
    const regex = new RegExp(`^${expectedComment}.*$`)
    const existingComment = (comments).find((comment) => regex.test(comment.body ?? ''))

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
    const diff = diffs.find((file) => commitObject.data.files?.some((commitFile) => commitFile.filename === file.filename))

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
      commit_id: commit.sha
    })
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
