const _ = require('lodash')
const { log } = require('./log')
const { paginate } = require('./pagination')

const findCommitsWithPathChangesQuery = /* GraphQL */ `
  query findCommitsWithPathChangesQuery(
    $name: String!
    $owner: String!
    $targetCommitish: String!
    $since: GitTimestamp
    $after: String
    $path: String
  ) {
    repository(name: $name, owner: $owner) {
      object(expression: $targetCommitish) {
        ... on Commit {
          history(path: $path, since: $since, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
            }
          }
        }
      }
    }
  }
`

const findCommitsWithAssociatedPullRequestsQuery = /* GraphQL */ `
  query findCommitsWithAssociatedPullRequests(
    $name: String!
    $owner: String!
    $stableRef: String!
    $stagingRef: String!
    $withPullRequestBody: Boolean!
    $withPullRequestURL: Boolean!
    $after: String
    $withBaseRefName: Boolean!
    $withHeadRefName: Boolean!
  ) {
    repository(name: $name, owner: $owner) {
      ref(qualifiedName: $stableRef) {
        compare(headRef: $stagingRef) {
          commits(first: 100, after: $after) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              committedDate
              message
              author {
                name
                user {
                  login
                }
              }
              associatedPullRequests(first: 5) {
                nodes {
                  title
                  number
                  url @include(if: $withPullRequestURL)
                  body @include(if: $withPullRequestBody)
                  author {
                    login
                  }
                  baseRepository {
                    nameWithOwner
                  }
                  mergedAt
                  isCrossRepository
                  labels(first: 100) {
                    nodes {
                      name
                    }
                  }
                  merged
                  baseRefName @include(if: $withBaseRefName)
                  headRefName @include(if: $withHeadRefName)
                }
              }
            }
          }
        }
      }
    }
  }
`

const findCommitsWithAssociatedPullRequests = async ({ context, config }) => {
  const { owner, repo } = context.repo()
  const { 'stable-ref': stableRef, 'staging-ref': stagingRef } = config
  const variables = {
    name: repo,
    owner,
    stableRef,
    stagingRef,
    withPullRequestBody: config['change-template'].includes('$BODY'),
    withPullRequestURL: config['change-template'].includes('$URL'),
    withBaseRefName: config['change-template'].includes('$BASE_REF_NAME'),
    withHeadRefName: config['change-template'].includes('$HEAD_REF_NAME'),
  }
  const includePaths = config['include-paths']
  const dataPath = ['repository', 'ref', 'compare', 'commits']
  const repoNameWithOwner = `${owner}/${repo}`

  let data,
    allCommits,
    includedIds = {}

  log({
    context,
    message: `Fetching commits in ${stagingRef} but not in ${stableRef}`,
  })

  data = await paginate(
    context.octokit.graphql,
    findCommitsWithAssociatedPullRequestsQuery,
    variables,
    dataPath
  )
  allCommits = _.get(data, [...dataPath, 'nodes'])

  const commits =
    includePaths.length > 0
      ? allCommits.filter((commit) =>
          includePaths.some((path) => includedIds[path].has(commit.id))
        )
      : allCommits

  const pullRequests = _.uniqBy(
    commits.flatMap((commit) => commit.associatedPullRequests.nodes),
    'number'
  ).filter(
    (pr) => pr.baseRepository.nameWithOwner === repoNameWithOwner && pr.merged
  )

  return { commits, pullRequests }
}

exports.findCommitsWithAssociatedPullRequestsQuery =
  findCommitsWithAssociatedPullRequestsQuery

exports.findCommitsWithPathChangesQuery = findCommitsWithPathChangesQuery

exports.findCommitsWithAssociatedPullRequests =
  findCommitsWithAssociatedPullRequests
