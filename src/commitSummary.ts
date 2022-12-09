import { octokit } from './octokit'
import { MAX_OPEN_AI_QUERY_LENGTH, MAX_TOKENS, MODEL_NAME, openai, TEMPERATURE } from './openAi'
import { gitDiffMetadata } from './DiffMetadata'
import { SHARED_PROMPT } from './sharedPrompt'
import { summarizePr } from './summarizePr'

const OPEN_AI_PRIMING = `${SHARED_PROMPT}
After the git diff of the first file, there will be an empty line, and then the git diff of the next file. 

For comments that refer to 1 or 2 modified files,
add the file names as [path/to/modified/python/file.py], [path/to/another/file.json]
at the end of the comment.
If there are more than two, do not include the file names in this way.
Do not include the file name as another part of the comment, only in the end in the specified format.
Do not use the characters \`[\` or \`]\` in the summary for other purposes.
Write every summary comment in a new line.
Comments should be in a bullet point list, each line starting with a \`*\`.
The summary should not include comments copied from the code.
The output should be easily readable. When in doubt, write less comments and not more.
Readability is top priority. Write only the most important comments about the diff.

EXAMPLE SUMMARY COMMENTS:
\`\`\`
* Raised the amount of returned recordings from \`10\` to \`100\` [packages/server/recordings_api.ts], [packages/server/constants.ts]
* Fixed a typo in the github action name [.github/workflows/gpt-commit-summarizer.yml]
* Moved the \`octokit\` initialization to a separate file [src/octokit.ts], [src/index.ts]
* Added an OpenAI API for completions [packages/utils/apis/openai.ts]
* Lowered numeric tolerance for test files
\`\`\`
Most commits will have less comments than this examples list.
The last comment does not include the file names,
because there were more than two relevant files in the hypothetical commit.
Do not include parts of the example in your summary.
It is given only as an example of appropriate comments.
`

const MAX_COMMITS_TO_SUMMARIZE = 20

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
  console.log('Preprocessed summary:\n', summary)
  for (const fileName of filesList) {
    const splitFileName = fileName.split('/')
    const shortName = splitFileName[splitFileName.length - 1]
    const link = 'https://github.com/' +
      `${diffMetadata.repository.owner.login}/` +
      `${diffMetadata.repository.name}/blob/` +
      `${diffMetadata.commit.data.sha}/` +
      `${fileName}`
    summary = summary.split(`[${fileName}]`).join(`[${shortName}](${link})`)
  }
  console.log('Postprocessed summary:\n', summary)
  return summary
}

async function getOpenAICompletion (comparison: Awaited<ReturnType<typeof octokit.repos.compareCommits>>, completion: string, diffMetadata: gitDiffMetadata): Promise<string> {
  try {
    const diffResponse = await octokit.request(comparison.url)
    console.log('Fetching diff:', diffResponse.data.diff_url)

    const rawGitDiff = diffResponse.data.files.map((file: any) => formatGitDiff(file.filename, file.patch)).join('\n')
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `${OPEN_AI_PRIMING}\n\nTHE GIT DIFF TO BE SUMMARIZED:\n\`\`\`\n${rawGitDiff}\n\`\`\`\n\nTHE SUMMERY:\n`

    console.log(`OpenAI prompt: ${openAIPrompt}`)

    if (openAIPrompt.length > MAX_OPEN_AI_QUERY_LENGTH) {
      throw new Error('OpenAI query too big')
    }

    const response = await openai.createCompletion({
      model: MODEL_NAME,
      prompt: openAIPrompt,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE
    })

    if (response.data.choices !== undefined && response.data.choices.length > 0) {
      completion = postprocessSummary(diffResponse.data.files.map((file: any) => file.filename), response.data.choices[0].text ?? "Error: couldn't generate summary", diffMetadata)
    }
  } catch (error) {
    console.error(error)
  }
  return completion
}

export async function summarizeCommits (
  pullNumber: number,
  repository: { owner: { login: string }, name: string },
  modifiedFilesSummaries: Record<string, string>
): Promise<Array<[string, string]>> {
  const commitSummaries: Array<[string, string]> = []

  const pull = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: pullNumber
  })

  let commitsSummarized = 0

  // For each commit, get the list of files that were modified
  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })

  const headCommit = pull.data.head.sha

  let needsToSummarizeHead = true
  for (const commit of commits) {
    // Check if a comment for this commit already exists
    const expectedComment = `GPT summary of ${commit.sha}:`
    const regex = new RegExp(`^${expectedComment}.*`)
    const existingComment = comments.find((comment) => regex.test(comment.body ?? ''))

    // If a comment already exists, skip this commit
    if (existingComment !== undefined) {
      const currentCommitAbovePrSummary = existingComment.body?.split('PR summary so far:')[0] ?? ''
      const summaryLines = currentCommitAbovePrSummary.split('\n').slice(1).join('\n')
      commitSummaries.push([commit.sha, summaryLines])
      continue
    }

    if (commit.sha === headCommit) {
      needsToSummarizeHead = false
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
        issueNumber: pullNumber,
        repository,
        commit: commitObject
      })
    } else {
      completion = 'Not generating summary for merge commits'
    }

    commitSummaries.push([commit.sha, completion])

    // Create a comment on the pull request with the names of the files that were modified in the commit
    const comment = `GPT summary of ${commit.sha}:\n\n${completion}`

    if (commit.sha !== headCommit) {
      await octokit.issues.createComment({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: pullNumber,
        body: comment,
        commit_id: commit.sha
      })
    }
    commitsSummarized++
    if (commitsSummarized >= MAX_COMMITS_TO_SUMMARIZE) {
      console.log('Max commits summarized - if you want to summarize more, rerun the action. This is a protection against spamming the PR with comments')
      break
    }
  }
  const headCommitShaAndSummary = commitSummaries.find(([sha, summary]) => sha === headCommit)
  if (needsToSummarizeHead && headCommitShaAndSummary !== undefined) {
    let prSummary = 'Error summarizing PR'
    try {
      prSummary = await summarizePr(modifiedFilesSummaries, commitSummaries)
    } catch (error) {
      console.error(error)
    }
    const comment = `GPT summary of ${headCommit}:\n\n${headCommitShaAndSummary[1]}\n\nPR summary so far:\n\n${prSummary}`
    await octokit.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pullNumber,
      body: comment,
      commit_id: headCommit
    })
  }
  return commitSummaries
}
