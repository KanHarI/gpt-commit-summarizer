# gpt-commit-summarizer
See [announcement blogpost](https://medium.com/@knaan.harpaz/leverage-openais-language-model-for-automated-commit-summaries-8181cef30375?source=friends_link&sk=b71a6799548f52274d2d0888e9bfd97e).

The `gpt-commit-summarizer` GitHub Action is a powerful tool that harnesses the capabilities of OpenAI's state-of-the-art text-davinci-003 large language model to provide summaries of the changes introduced by a pull request in a repository. By generating the git diff for each commit and for each modified file and sending it to the OpenAI API with a carefully crafted prompt, the action is able to produce concise and informative summaries that can greatly enhance collaboration and understanding in large codebases.

The action then performs a higher level call to the OpenAI API to generate a summary of the entire pull request, from the summaries of individual commits and file differences. This summary is then posted as a comment on the pull request.

## Setting up
To use this action, you will need to have an OpenAI API key. If you don't already have one, you can sign up for an OpenAI API key [here](https://beta.openai.com/docs/quickstart).

Once you have your API key, you will need to add it to your GitHub repository as a secret. To do this, go to your repository's settings and navigate to the "Secrets" section. Click on "Add a new secret" and enter the secret name OPENAI_API_KEY and the value of your API key.

Next, you will need to add the workflow file to your repository. Create a file named `.github/workflows/gpt-commit-summarizer.yml` (relative to the git root folder) and copy the following code into it:
```yaml
name: GPT Commits summarizer
# Summary: This action will write a comment about every commit in a pull request, as well as generate a summary for every file that was modified and add it to the review page, compile a PR summary from all commit summaries and file diff summaries, and delete outdated code review comments

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: ubuntu-latest
    permissions: write-all  # Some repositories need this line

    steps:
      - uses: KanHarI/gpt-commit-summarizer@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```
This workflow file tells GitHub to run the action whenever a new pull request is opened or updated.

That's it! You're now ready to use the gpt-commit-summarizer action in your repository. Each time a pull request is opened or updated, the action will automatically generate a summary of the changes made in each commit, add a summary for every file that was modified to the review page, compile a PR summary from all commit summaries and file diff summaries, and delete outdated code review comments.

## Troubleshooting
I have heard some unverified reports that the OpenAI API may block requests from the IP addresses of some runners. If you encounter this issue, you can try using a self-hosted runner to run the gpt-commit-summarizer action. This can be done by setting up a runner on a server that you control, and then adding the runner to your repository.

To set up a self-hosted runner, you will need to follow these steps:

* Install the GitHub Actions Runner on your server. Follow the instructions in the [documentation](https://docs.github.com/en/actions/hosting-your-own-runners/adding-self-hosted-runners) to do this.

* Add the self-hosted runner to your repository. Follow the instructions in the documentation to do this.

* Modify the workflow file to use the self-hosted runner. Open the .github/workflows/gpt-commit-summarizer.yml file and add the `runs-on` field to specify the self-hosted runner that you want to use. For example:
```yaml
name: GPT Commits summarizer
# Summary: This action will write a comment about every commit in a pull request, as well as generate a summary for every file that was modified and add it to the review page, compile a PR summary from all commit summaries and file diff summaries, and delete outdated code review comments

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: self-hosted
    permissions: write-all  # Some repositories need this line

    steps:
      - uses: KanHarI/gpt-commit-summarizer@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Encountered any bugs?
If you encounter any bugs or have any suggestions for improvements, please open an issue on the repository. Alternatively, you can contact me at my [email](mailto:knaan.harpaz@gmail.com).

## License
This project is licensed under the [MIT License](./LICENSE).
