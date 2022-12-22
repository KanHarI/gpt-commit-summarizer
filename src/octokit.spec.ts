/* write a unit test in jest for the following typescript module.  
the test should listFiles from a pull request from the repo called 'testproj' with owner 'd4nshields' and with pull_number "1".  
For each file returned should check that all required properties exist */

// import { Octokit } from "@octokit/rest";
// 
// export const octokit = new Octokit({
//   auth: process.env.GITHUB_TOKEN,
// });
// 

import {octokit} from './octokit';

export type ListFilesParams = {
    owner: string;
    repo: string;
    pull_number: number;
  };
  
  export async function listFiles(params: ListFilesParams) {
    const { data: files } = await octokit.pulls.listFiles({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pull_number,
    });
    return files;
  }
  
  describe("listFiles()", () => {
    it("should list all the files from a pull request from the repo 'testproj' with owner 'd4nshields' and pull_number 1", async () => {
      const params: ListFilesParams = {
        owner: "d4nshields",
        repo: "testproj",
        pull_number: 1,
      };
      const files = await listFiles(params);
  
      files.forEach((file) => {
        expect(file.filename).toBeDefined();
        expect(file.status).toBeDefined();
        expect(file.additions).toBeDefined();
        expect(file.deletions).toBeDefined();
        expect(file.changes).toBeDefined();
        expect(file.blob_url).toBeDefined();
        expect(file.raw_url).toBeDefined();
        expect(file.contents_url).toBeDefined();
        expect(file.patch).toBeDefined();
      });
    });
  });