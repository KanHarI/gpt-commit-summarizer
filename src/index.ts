import { context } from '@actions/github'

import { octokit } from './octokit'
import {getOpenAICompletion} from "./commitSummary";


const MAX_COMMITS_TO_SUMMARIZE = 20

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

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: issueNumber
  })

  let commitsSummarized = 0

  // For each commit, get the list of files that were modified
  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: issueNumber
  })

  for (const commit of commits) {
    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}:`
    const regex = new RegExp(`^${expectedComment}.*`)
    const existingComment = comments.find((comment) => regex.test(comment.body ?? ''))

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

    const isMergeCommit = (commitObject.data.parents.length !== 1)
    const parent = commitObject.data.parents[0].sha

    const comparison = await octokit.repos.compareCommits({
      owner: repository.owner.login,
      repo: repository.name,
      base: parent,
      head: commit.sha
    })

    let completion = "Error: couldn't generate summary"
    if (!isMergeCommit) {
      completion = await getOpenAICompletion(comparison, completion, {
        sha: commit.sha,
        issueNumber,
        repository,
        commit: commitObject
      })
    } else {
      completion = 'Not generating summary for merge commits'
    }

    // Create a comment on the pull request with the names of the files that were modified in the commit
    const comment = `GPT summary of ${commit.sha}:\n\n${completion}`

    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issueNumber,
      body: comment,
      commit_id: commit.sha
    })
    commitsSummarized++
    if (commitsSummarized >= MAX_COMMITS_TO_SUMMARIZE) {
      console.log('Max commits summarized - if you want to summarize more, rerun the action. This is a protection against spamming the PR with comments')
      break
    }
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
