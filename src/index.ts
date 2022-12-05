import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

const octokit = new Octokit()

async function run (): Promise<void> {
  try {
    // Get the pull request number and repository owner and name from the context object
    const {
      number,
      repository
    } = (context.payload.pull_request as {
      number: number
      repository: { owner: string, repo: string }
    })
    const { owner, repo } = repository

    // Get the list of commits for the pull request
    const commits = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: number
    })

    // For each commit, get the list of files that were modified
    for (const commit of commits.data) {
      const files = (await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: number,
        commit_sha: commit.sha
      })).data

      // Create a comment on the pull request with the names of the files that were modified in the commit
      const comment = `Files modified in commit ${commit.sha}: ${files
        .map((file) => file.filename)
        .join(', ')}`
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: comment
      })
    }
  } catch (error) {
    // Handle any errors that may occur
    console.error(error)
  }
}

run()
