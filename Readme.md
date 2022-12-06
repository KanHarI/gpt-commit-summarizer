# gpt-commit-summarizer
This is a GitHub Action that uses OpenAI's GPT-3 language model to generate
a summary of each commit in a pull request. This can be helpful for
providing a high-level overview of the changes made in a pull request,
making it easier to review and understand.

## Setting up
To use this action, you will need to have an OpenAI API key.
If you don't already have one, you can sign up for an OpenAI API 
key [here](https://beta.openai.com/docs/quickstart).

Once you have your API key, you will need to add it to your GitHub
repository as a secret. To do this, go to your repository's settings
and navigate to the "Secrets" section. Click on "Add a new secret"
and enter the secret name OPENAI_API_KEY and the value of your API key.

Next, you will need to add the workflow file to your repository.
Create a file named .github/workflows/gpt-commit-summarizer.yml (relative 
to the git root folder) and copy the following code into it:
```yaml
name: GPT Commits summarizer
# Summary: This action will write a comment about every commit in a pull request

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: ubuntu-latest

    steps:
      - uses: KanHarI/gpt-commit-summarizer@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

```
This workflow file tells GitHub to run the action whenever a new pull 
request is opened or updated.

That's it! You're now ready to use the gpt-commit-summarizer action
in your repository. Each time a pull request is opened or updated,
the action will automatically generate a summary of the changes made
in each commit and post it as a comment on the pull request.

## Troubleshooting
In some cases, the OpenAI API may block requests from the IP addresses
of GitHub's hosted runners. If you encounter this issue, you can try
using a self-hosted runner to run the gpt-commit-summarizer action.
This can be done by setting up a runner on a server that you control,
and then adding the runner to your repository.

To set up a self-hosted runner, you will need to follow these steps:

* Install the GitHub Actions Runner on your server. Follow the instructions in the [documentation](https://docs.github.com/en/actions/hosting-your-own-runners/adding-self-hosted-runners) to do this.

* Add the self-hosted runner to your repository. Follow the instructions in the documentation to do this.

* Modify the workflow file to use the self-hosted runner. Open the .github/workflows/gpt-commit-summarizer.yml file and add the runs-on field to specify the self-hosted runner that you want to use. For example:
```yaml
name: GPT Commits summarizer
# Summary: This action will write a comment about every commit in a pull request

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  summarize:
    runs-on: self-hosted

    steps:
      - uses: KanHarI/gpt-commit-summarizer@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

```


## License
This project is licensed under the [MIT License](./LICENSE).
