import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

import { Configuration, OpenAIApi } from 'openai'

const OPEN_AI_PRIMING = 'You are an expert programmer, and you are trying to summarize a git diff. The git diff is not in the usual format, but in a very close format. Go over the git diff and summarize it.\n' +
  '\n' +
  '\n' +
  'Please write a summary of the changes in the diff. For each change, if there is a relevant file, write [filename]:[comment]. An example of this format is\n' +
  '```\n' +
  '[/path/to/a/file]: Summary of the change\n' +
  '```\n' +
  'If there are any other changes that are not localized to a single file, write them as\n' +
  '```\n' +
  '[General]: Switched from raw list manipulation to vectorization using numpy\n' +
  '```\n'

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(configuration)

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

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: number
  })

  // For each commit, get the list of files that were modified
  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number
  })

  for (const commit of commits) {
    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}: `
    const regex = new RegExp(`^${expectedComment}.*$`)
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

    const parent = commitObject.data.parents[0].sha

    const comparison = await octokit.repos.compareCommits({
      owner: repository.owner.login,
      repo: repository.name,
      base: parent,
      head: commit.sha
    })

    console.log('Got comparison')

    const diffResponse = await octokit.request(comparison.url)

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const commitRawDiff = diffResponse.data.files.map((file: any) => `DIFF IN ${file.filename}: \n${file.patch}`).join('\n')

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `${OPEN_AI_PRIMING}\n\nThe git diff is:\n\`\`\`\n${commitRawDiff}\n\`\`\`\n\nThe summary is:\n`

    // TODO: Ask OpenAI for a completion using text-davinci-003
    console.log(openAIPrompt)
    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: openAIPrompt,
      max_tokens: 512,
      temperature: 0.5
    })

    console.log(response)

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
