import { predict } from "./vertexAi";

const OPEN_AI_PROMPT = `You are an expert programmer, and you are trying to summarize a pull request.
You went over every commit that is part of the pull request and over every file that was changed in it.
For some of these, there was an error in the commit summary, or in the files diff summary.
Please summarize the pull request. Write your response in bullet points, starting each bullet point with a \`*\`.
Write a high level description. Do not repeat the commit summaries or the file summaries.
Write the most important bullet points. The list should not be more than a few bullet points.
`;

const linkRegex = /\[.*?\]\(https:\/\/github\.com\/.*?[a-zA-Z0-f]{40}\/(.*?)\)/;

function preprocessCommitMessage(commitMessage: string): string {
  let match = commitMessage.match(linkRegex);
  while (match !== null) {
    commitMessage = commitMessage.split(match[0]).join(`[${match[1]}]`);
    match = commitMessage.match(linkRegex);
  }
  return commitMessage;
}

export async function summarizePr(
  fileSummaries: Record<string, string>,
  commitSummaries: Array<[string, string]>
): Promise<string> {
  const commitsString = Array.from(commitSummaries.entries())
    .map(
      ([idx, [, summary]]) =>
        `Commit #${idx + 1}:\n${preprocessCommitMessage(summary)}`
    )
    .join("\n");
  const filesString = Object.entries(fileSummaries)
    .map(([filename, summary]) => `File ${filename}:\n${summary}`)
    .join("\n");
  const openAIPrompt = `${OPEN_AI_PROMPT}\n\nTHE COMMIT SUMMARIES:\n\`\`\`\n${commitsString}\n\`\`\`\n\nTHE FILE SUMMARIES:\n\`\`\`\n${filesString}\n\`\`\`\n\n
  Reminder - write only the most important points. No more than a few bullet points.
  THE PULL REQUEST SUMMARY:\n`;
  console.log(`Requesting AI for PR summary`);

  try {
    return (await predict(openAIPrompt)) ?? "Error: couldn't generate summary";
  } catch (error) {
    console.error(error);
    return "Error: couldn't generate summary";
  }
}
