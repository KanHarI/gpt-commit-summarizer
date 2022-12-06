import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

import { Configuration, OpenAIApi } from 'openai'

const OPEN_AI_PRIMING = 'You are an expert programmer, and you are trying to summarize a git diff. The git diff is not in the usual format, but in a very close format. Go over the git diff and summarize it. Do not repeat comments from the code in the summary.\n' +
  'Please notice that a line that starting with `-` means that line was deleted.\n' +
  'A line starting with `+` means it was added.\n' +
  'A line that starts with neither is code given for context and better understanding. It is not part of the diff.\n' +
  'An example of the diff format:\n' +
  '```\n' +
  '--- a/packages/utils/math/IAmNotARealFile.ts\n' +
  '+++ b/packages/utils/math/IAmNotARealFile.ts\n' +
  '@@ -1 +1 @@\n' +
  '-export const I_AM_NOT_A_REAL_FILE = 20;\n' +
  '+export const I_AM_NOT_A_REAL_FILE = 21;\n' +
  'export const ANOTHER_CONSTANT = 40;\n' +
  '```\n' +
  'This means that the constant `I_AM_NOT_A_REAL_FILE` was changed from 20 to 21.\n' +
  '\n' +
  'Please write a summary of the changes in the diff.\n' +
  '\n' +
  'Fot example, if we swithced the distance graph calculation from using scipy to numpy, and it required changes in many files, write:\n' +
  '```\n' +
  '* Switched distance graph calculation from `scipy` to `numpy`\n' +
  '```\n' +
  'Write every summary comment in a new line. Comments should be in a bullet point list, each line starting with a `*`.' +
  'The summary should not include comments copied from the code. Write more important comments before less important ones.' +
  'The output should be easily readable. When in doubt, write less comments and not more.' +
  'Readability is top priority. Write only the most important comments about the diff.'

const MAX_COMMITS_TO_SUMMARIZE = 5

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(configuration)

function formatGitDiff (filename: string, patch: string): string {
  const result = []
  result.push(`--- a/${filename}`)
  result.push(`+++ b/${filename}`)
  for (const line of patch.split('\n')) {
    result.push(line)
  }
  result.push('')
  return result.join('\n')
}

async function getOpenAICompletion (comparison: Awaited<ReturnType<typeof octokit.repos.compareCommits>>, completion: string): Promise<string> {
  try {
    const diffResponse = await octokit.request(comparison.url)

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const commitRawDiff = diffResponse.data.files.map((file: any) => formatGitDiff(file.filename, file.patch)).join('\n')

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `${OPEN_AI_PRIMING}\n\nThe git diff is:\n\`\`\`\n${commitRawDiff}\n\`\`\`\n\nThe summary is:\n`

    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: openAIPrompt,
      max_tokens: 512,
      temperature: 0.5
    })

    if (response.data.choices !== undefined && response.data.choices.length > 0) {
      completion = response.data.choices[0].text ?? "Error: couldn't generate summary"
    }
  } catch (error) {
    console.error(error)
  }
  return completion
}

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
      completion = await getOpenAICompletion(comparison, completion)
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
