
# notes from an on-looker (d4nshields) on gpt-commit-summarizer

I began taking a look at the layout and structure of this solution.   Realising that the functions were guided by a conversation with ChatGPT, I decided to do the same to generate a few sample unit tests for this project.

Personally I don't know anything about how to use octokit or how to interface directly with the GitHub API, so I decided to ask ChatGPT for some help.   I pasted the code from src/octokit.ts and asked how an expert software developer would unit test this code.

Question: 
```typescript
/* write a unit test in jest for the following typescript module.  
the test should listFiles from a pull request from the repo called 'testproj' with owner 'd4nshields' and with pull_number "1".  
For each file returned should check that all required properties exist */

import { Octokit } from "@octokit/rest";

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});
```

Answer:
```typescript
export async function listFiles(owner, repo, pull_number) {
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });
  
    return files;
  }
  
  describe("listFiles", () => {
    it("should return a list of files from a pull request", async () => {
      const files = await listFiles("d4nshields", "testproj", 1);
  
      expect(files).toBeDefined();
      expect(files.length).toBeGreaterThan(0);
  
      files.forEach(file => {
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
```

  This didn't make typescript happy though, because there is typing information missing on the listFiles method and I happen to have noImplicitAny set, so I added this to the prompt:
```
...
Add relevant types to the parameters of listFiles
 */
```

and ChatGPT gave:

```
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
```

  To execute this test, I had to install jest, add an import statement, and allocate a GITHUB_TOKEN with repo access and define that in my environment.    
  
```
 PASS  src/octokit.spec.ts
  listFiles()
    ✓ should list all the files from a pull request from the repo 'testproj' with owner 'd4nshields' and pull_number 1 (365 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        2.361 s
```
  
  
  Then I moved on to testing the 
  src/filesSummary.ts module using a similar conversation.   Now I had to obtain and OPENAI token and define that in my environment as well, which also worked. 
  
  As a software developer I can see my role here was to provide only *intention* coupled with no required knowledge of the underlying APIs.   ChatGPT offered this final comment on 
  the benefits of using this method:
  
 ```
 Writing unit tests using large language models is a great way to ensure that your code is 
 doing what it is supposed to do.  By using large language models, you can write tests that 
 check for a variety of scenarios,  from simple input/output tests to more complex tests that 
 use natural language processing to check for understanding of the language. This allows you 
 to catch bugs and errors early on, reducing the amount of time needed for debugging and 
 ensuring that your code is functioning correctly. Additionally, using large language models 
 allows you to have more confidence in the reliability of your code, as you have tested it 
 in a variety of ways.
 ```

