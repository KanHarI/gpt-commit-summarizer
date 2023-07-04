import { octokit } from "./octokit";
import { summarizeRelease } from "./summarizeRelease";

describe("summarizeRelease", () => {
  test("first", async () => {
    const repository = {
      owner: {
        login: "josepmc",
      },
      name: "cli",
    };
    const release = await octokit.repos.getLatestRelease({
      owner: repository.owner.login,
      repo: repository.name,
    });
    let updateRelease = false;
    let generateReleaseImages = false;
    if (process.env.OPENAI_API_KEY) {
      updateRelease = true;
      generateReleaseImages = true;
    }
    const releaseSummary = await summarizeRelease(
      release.data,
      repository,
      updateRelease, // set this to true to update the last release */
      generateReleaseImages // set this to true to generate release images, these cost 0.02$ per image! */
    );
    console.log(`releaseSummary:\n`, releaseSummary);
    expect(releaseSummary).toBeDefined();
    expect(releaseSummary).not.toBe("");
  });
});
