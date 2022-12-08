import { PayloadRepository } from '@actions/github/lib/interfaces'
import { octokit } from './octokit'

export interface gitDiffMetadata {
  sha: string
  issueNumber: number
  repository: PayloadRepository
  commit: Awaited<ReturnType<typeof octokit.repos.getCommit>>
}
