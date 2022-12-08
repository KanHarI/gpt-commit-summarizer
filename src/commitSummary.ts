import { octokit } from './octokit'
import { openai } from './openAi'
import { gitDiffMetadata } from './DiffMetadata'

const OPEN_AI_PRIMING = `You are an expert programmer, and you are trying to summarize a git diff.
Reminders about the git diff format:
For every file, there are a few metadata lines, like (for example):
\`\`\`
diff --git a/lib/index.js b/lib/index.js
index aadf691..bfef603 100644
--- a/lib/index.js
+++ b/lib/index.js
\`\`\`
This means that \`lib/index.js\` was modified in this commit. Note that this is only an example.
Then there is a specifier of the lines that were modified.
A line starting with \`+\` means it was added.
A line that starting with \`-\` means that line was deleted.
A line that starts with neither \`+\` nor \`-\` is code given for context and better understanding. 
It is not part of the diff.

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

export async function getOpenAICompletion (comparison: Awaited<ReturnType<typeof octokit.repos.compareCommits>>, completion: string, diffMetadata: gitDiffMetadata): Promise<string> {
  try {
    const diffResponse = await octokit.request(comparison.url)
    console.log('Fetching diff:', diffResponse.data.diff_url)

    const rawGitDiff = diffResponse.data.files.map((file: any) => formatGitDiff(file.filename, file.patch)).join('\n')
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const openAIPrompt = `${OPEN_AI_PRIMING}\n\nTHE GIT DIFF TO BE SUMMARIZED:\n\`\`\`\n${rawGitDiff}\n\`\`\`\n\nTHE SUMMERY:\n`

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
