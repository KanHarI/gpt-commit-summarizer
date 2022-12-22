import { getFilesSummaries } from "./filesSummary";

describe('getFilesSummaries', () => {
    test('first', async () => {
      const issueNumber = 1;
      const repository = {
        owner: {
          login: 'd4nshields'
        },
        name: 'testproj'
      }
      const modifiedFilesSummaries = await getFilesSummaries(issueNumber, repository);
      console.log( 'modifiedFilesSummaries: ', JSON.stringify( modifiedFilesSummaries, null, 2));
      expect(modifiedFilesSummaries).toBeDefined();
      expect(typeof modifiedFilesSummaries).toBe("object");
      expect(Object.keys(modifiedFilesSummaries).length).toBeGreaterThan(0);
    })
  });