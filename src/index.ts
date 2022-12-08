import { Octokit } from '@octokit/rest'
import { context } from '@actions/github'

import { Configuration, OpenAIApi } from 'openai'
import { PayloadRepository } from '@actions/github/lib/interfaces'

const OPEN_AI_PRIMING = `You are an expert programmer, and you are trying to summarize a git diff.
THE GIT DIFF FORMAT:
The git diff is a list of files that were modified in a commit and their modifications.
The first two lines for every modified file looks like this:
--- a/path/to/modified/python/file.py
+++ b/path/to/modified/python/file.py
This means that \`path/to/modified/python/file.py\` was modified in this commit.
A line that starts with neither is code given for context and better understanding. 
It is not part of the diff.
Please notice that a line that starting with \`-\` means that line was deleted.
A line starting with \`+\` means it was added.
After the git diff of the first file, there will be an empty line, and then the git diff of the next file. 
Do not refer to lines that were not modified in the commit.

For comments that refer to 1 or 2 modified files,
add the file names as [path/to/modified/python/file.py], [path/to/another/file.json]
at the end of the comment.
If there are more than two, do not include the file names in this way.
Do not use the characters \`[\` or \`]\` in the summary for other purposes.
Write every summary comment in a new line.
Comments should be in a bullet point list, each line starting with a \`*\`.
The summary should not include comments copied from the code.
The output should be easily readable. When in doubt, write less comments and not more.
Readability is top priority. Write only the most important comments about the diff.

EXAMPLE SUMMARY FORMAT:
\`\`\`
* Raised the amount of returned recordings from 10 to 100 [recordings_api.ts], [constants.ts]
* Fixed a typo in the github action name [gpt-commit-summarizer.yml]
* Changed indentation style in all YAMLs
\`\`\`
Do not include parts of the example in your summary. It is given only as an output example.
`

const MAX_COMMITS_TO_SUMMARIZE = 5

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(configuration)

interface gitDiffMetadata {
  sha: string
  issueNumber: number
  repository: PayloadRepository
  patches?: Record<string, string>
}

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

function postprocessSummary (filesList: string[], summary: string, diffMetadata: gitDiffMetadata): string {
  console.log('Postprocessing summary')
  console.log('filesList:\n', filesList)
  console.log('summary:\n', summary)
  for (const fileName of filesList) {
    const link = 'https://github.com/' +
      `${diffMetadata.repository.owner.login}/` +
      `${diffMetadata.repository.name}/pull/` +
      `${diffMetadata.issueNumber}/` +
      `files#diff-${((diffMetadata.patches !== undefined) ? diffMetadata.patches[fileName] : undefined) ?? ''}`
    summary = summary.split(`[${fileName}]`).join(`[${fileName}](${link})`)
  }
  console.log('Postprocessed summary:\n', summary)
  return summary
}

async function getOpenAICompletion (comparison: Awaited<ReturnType<typeof octokit.repos.compareCommits>>, completion: string, diffMetadata: gitDiffMetadata): Promise<string> {
  try {
    const diffResponse = await octokit.request(comparison.url)

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const commitRawDiff = diffResponse.data.files.map((file: any) => formatGitDiff(file.filename, file.patch)).join('\n')

    console.log('diffResponse:\n', diffResponse)
    console.log('diffResponse.data.files:\n', diffResponse.data.files)

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `${OPEN_AI_PRIMING}\n\nTHE GIT DIFF TO BE SUMMARIZED:\n\`\`\`\n${commitRawDiff}\n\`\`\`\n\nTHE SUMMERY:\n`

    console.log(`OpenAI prompt: ${openAIPrompt}`)

    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: openAIPrompt,
      max_tokens: 512,
      temperature: 0.5
    })

    if (response.data.choices !== undefined && response.data.choices.length > 0) {
      completion = postprocessSummary(diffResponse.data.files.map((file: any) => file.filename), response.data.choices[0].text ?? "Error: couldn't generate summary", diffMetadata)
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
      completion = await getOpenAICompletion(comparison, completion, {
        sha: commit.sha,
        issueNumber,
        repository,
        patches: undefined
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
