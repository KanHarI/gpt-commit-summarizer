import { octokit } from './octokit'
import { PayloadRepository } from '@actions/github/lib/interfaces'
import { SHARED_PROMPT } from './sharedPrompt'
import { MAX_OPEN_AI_QUERY_LENGTH, MAX_TOKENS, MODEL_NAME, openai, TEMPERATURE } from './openAi'

const OPEN_AI_PROMPT = `${SHARED_PROMPT}
The following is a git diff of a single file.
Please summarize it in a comment, describing the changes made in the diff in high level.
Do it in the following way:
Write \`SUMMARY:\` and then write a summary of the changes made in the diff, as a bullet point list.
Every bullet point should start with a \`*\`.
`

// const MAX_FILES_TO_SUMMARIZE = 1

async function getOpenAISummaryForFile (filename: string, patch: string): Promise<string> {
  try {
    const openAIPrompt = `${OPEN_AI_PROMPT}\n\nTHE GIT DIFF OF ${filename} TO BE SUMMARIZED:\n\`\`\`\n${patch}\n\`\`\`\n\nSUMMARY:\n`
    console.log(`OpenAI file summary prompt: ${openAIPrompt}`)

    if (openAIPrompt.length > MAX_OPEN_AI_QUERY_LENGTH) {
      throw new Error('OpenAI query too big')
    }

    const response = await openai.createCompletion({
      model: MODEL_NAME,
      prompt: openAIPrompt,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE
    })
    console.log('Raw openAI response:', response.data)
    if (response.data.choices !== undefined && response.data.choices.length > 0) {
      return response.data.choices[0].text ?? "Error: couldn't generate summary"
    }
  } catch (error) {
    console.error(error)
  }
  return "Error: couldn't generate summary"
}

async function getReviewComments (pullRequestNumber: number, repository: PayloadRepository): Promise<string[]> {
  const reviewComments = (await octokit.paginate(octokit.pulls.listReviewComments, {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullRequestNumber
  }) as unknown as Awaited<ReturnType<typeof octokit.pulls.listReviewComments>>)
  console.log('reviewComments:\n', reviewComments)
  return (reviewComments as unknown as Array<{ body?: string }>).map((reviewComment) => reviewComment.body ?? '')
}

export async function getFilesSummaries (pullNumber: number,
  repository: PayloadRepository): Promise<Record<string, string>> {
  const filesChanged = await octokit.pulls.listFiles({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  const pullRequest = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: pullNumber
  })
  const baseCommitSha = pullRequest.data.base.sha
  const headCommitSha = pullRequest.data.head.sha
  const baseCommitTree = await octokit.git.getTree({
    owner: repository.owner.login,
    repo: repository.name,
    tree_sha: baseCommitSha
  })
  const modifiedFiles: Record<string, { sha: string, originSha: string, diff: string, position: number, filename: string }> = {}
  for (const file of filesChanged.data) {
    console.log('file:\n', file)
    console.log('baseCommitTree.data:\n', baseCommitTree.data)
    const originSha = baseCommitTree.data.tree.find((tree: any) => tree.path === file.filename)?.sha ?? 'None'
    console.log('originSha:\n', originSha)
    const firstModifiedLineAfterCommit = Number(file.patch?.split('+')[1]?.split(',')[0]) ?? 0
    modifiedFiles[file.filename] = { sha: file.sha, originSha, diff: file.patch ?? '', position: firstModifiedLineAfterCommit, filename: file.filename }
  }
  const existingReviewSummaries = await getReviewComments(pullNumber, repository)
  const result: Record<string, string> = {}
  for (const modifiedFile of Object.keys(modifiedFiles)) {
    let isFileAlreadySummarized = false
    const expectedComment = `GPT summary of ${modifiedFiles[modifiedFile].originSha} - ${modifiedFiles[modifiedFile].sha}:`
    for (const reviewSummary of existingReviewSummaries) {
      if (reviewSummary.includes(expectedComment)) {
        const summary = reviewSummary.split('\n').slice(1).join('\n')
        result[modifiedFile] = summary
        isFileAlreadySummarized = true
        break
      }
    }
    if (isFileAlreadySummarized) {
      continue
    }
    const fileAnalysisAndSummary = await getOpenAISummaryForFile(modifiedFile, modifiedFiles[modifiedFile].diff)
    result[modifiedFile] = fileAnalysisAndSummary
    await octokit.pulls.createReviewComment({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: pullNumber,
      commit_id: headCommitSha,
      path: modifiedFiles[modifiedFile].filename,
      line: modifiedFiles[modifiedFile].position,
      body: `GPT summary of ${modifiedFiles[modifiedFile].originSha} - ${modifiedFiles[modifiedFile].sha}:\n${fileAnalysisAndSummary}`
    })
    break
  }
  return result
}
