import { ofetch } from 'ofetch'
import { joinURL } from 'ufo'
import type { GitOptions, GitProviderAPI, GitFile, RawFile, CommitResult, CommitFilesOptions, StudioFeature } from '../../types'
import { DraftStatus } from '../../types/draft'

interface AzureDevOpsError {
  status?: number
  message?: string
  data?: {
    message?: string
    typeKey?: string
  }
}

const NUXT_STUDIO_COAUTHOR = 'Co-authored-by: Nuxt Studio <noreply@nuxt.studio>'

export function createAzureDevOpsProvider(options: GitOptions): GitProviderAPI {
  const { organization, project, repo, token, branch, rootDir, authorName, authorEmail } = options
  const gitFiles: Record<string, GitFile> = {}

  console.log('[Azure DevOps] Initializing provider with:', { organization, project, repo, branch, rootDir })
  console.log('[Azure DevOps] Token prefix check:', token?.substring(0, 10) + '...')

  if (!organization || !project) {
    const error = 'Azure DevOps provider requires organization and project to be specified'
    console.error('[Azure DevOps]', error)
    throw new Error(error)
  }

  // Azure DevOps PAT tokens use Basic Authentication
  // Username can be empty string, PAT goes in password field
  // Format: Basic base64(:PAT)
  const isPAT = token.startsWith('az_pat_')
  console.log('[Azure DevOps] Token type:', isPAT ? 'PAT (az_pat_ prefix)' : 'Other')
  if (!isPAT) {
    console.warn('[Azure DevOps] Token does not start with az_pat_ prefix - this may cause authentication issues')
  }

  // Strip the az_pat_ prefix if present - Azure DevOps doesn't recognize it
  const actualToken = isPAT ? token.substring('az_pat_'.length) : token
  console.log('[Azure DevOps] Using token (first 10 chars):', actualToken.substring(0, 10) + '...')

  const authHeader = `Basic ${btoa(`:${actualToken}`)}`
  console.log('[Azure DevOps] Auth header created:', authHeader.substring(0, 20) + '...')

  const baseURL = `https://dev.azure.com/${organization}/${project}/_apis`
  console.log('[Azure DevOps] Base URL:', baseURL)

  const $api = ofetch.create({
    baseURL,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  })

  async function fetchFile(path: string, { cached = false }: { cached?: boolean } = {}): Promise<GitFile | null> {
    // Build full path: rootDir + relative path
    const fullPath = rootDir ? `${rootDir}/${path}` : path
    console.log('[Azure DevOps] Fetching file:', fullPath, { cached, rootDir, relativePath: path })
    if (cached) {
      const file = gitFiles[fullPath]
      if (file) {
        console.log('[Azure DevOps] File found in cache')
        return file
      }
    }

    try {
      console.log('[Azure DevOps] Requesting file from API...')
      // Azure Repos API endpoint for getting file content
      // GET https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/items?path={path}&api-version=7.1
      const response = await $api(`/git/repositories/${repo}/items`, {
        query: {
          'path': `/${fullPath}`,
          'api-version': '7.1',
          'includeContent': true,
          'versionDescriptor': {
            version: branch,
            versionType: 'branch',
          },
        },
      })

      const gitFile: GitFile = {
        provider: 'azure-devops' as const,
        name: fullPath.split('/').pop() || fullPath,
        path: fullPath,
        sha: response.objectId,
        size: response.size,
        url: response.url,
        content: response.content,
        encoding: 'utf-8' as const,
      }

      console.log('[Azure DevOps] File fetched successfully:', { size: response.size })
      if (cached) {
        gitFiles[fullPath] = gitFile
      }
      return gitFile
    }
    catch (error: unknown) {
      // Azure DevOps API error handling
      const azError = error as AzureDevOpsError
      if (azError?.status === 404 || azError?.data?.typeKey === 'GitItemNotFoundException') {
        console.warn(`[Azure DevOps] File not found: ${fullPath}`)
        return null
      }

      // Azure DevOps specific error formatting
      const errorMessage = azError?.data?.message || azError?.message || 'Unknown error'
      console.error(`[Azure DevOps] Failed to fetch file ${fullPath}:`, { status: azError?.status, message: errorMessage, typeKey: azError?.data?.typeKey })

      if (process.env.NODE_ENV === 'development') {
        alert(`Failed to fetch file: ${fullPath}\n${errorMessage}`)
      }

      return null
    }
  }

  async function commitFiles(files: RawFile[], message: string): Promise<CommitResult | null> {
    console.log('[Azure DevOps] commitFiles called with:', { filesCount: files.length, message })

    if (!token) {
      console.log('[Azure DevOps] No token available, aborting commit')
      return Promise.resolve(null)
    }

    files = files
      .filter(file => file.status !== DraftStatus.Pristine)
      .map(file => ({ ...file, path: joinURL(rootDir, file.path) }))

    console.log('[Azure DevOps] Filtered files to commit:', files.length)

    // Build commit message with Nuxt Studio co-author
    const fullMessage = `${message}\n\n${NUXT_STUDIO_COAUTHOR}`

    console.log('[Azure DevOps] Calling commitFilesToAzureDevOps with:', {
      organization, project, repo, branch, filesCount: files.length,
    })

    return commitFilesToAzureDevOps({
      organization,
      project,
      owner: organization!,
      repo,
      branch,
      files,
      message: fullMessage,
      authorName,
      authorEmail,
    })
  }

  async function commitFilesToAzureDevOps(
    { branch, files, message, authorName, authorEmail }: CommitFilesOptions & { organization?: string, project?: string },
  ) {
    console.log('[Azure DevOps] commitFilesToAzureDevOps started with:', { branch, filesCount: files.length, message, authorName, authorEmail })
    try {
      // First, get the latest commit for the branch to use as parent
      console.log(`[Azure DevOps] Fetching refs for branch: ${branch}`)
      const refs = await $api(`/git/repositories/${repo}/refs`, {
        query: {
          'filter': `heads/${branch}`,
          'api-version': '7.1',
        },
      })

      console.log(`[Azure DevOps] Refs response:`, refs)
      if (!refs.value || refs.value.length === 0) {
        console.error(`[Azure DevOps] Branch not found. Repository: ${repo}, Branch: ${branch}, Filter: heads/${branch}`)
        throw new Error(`Branch ${branch} not found`)
      }

      const oldObjectId = refs.value[0].objectId
      console.log(`[Azure DevOps] Branch ${branch} found with objectId: ${oldObjectId}`)

      // Build changes array for Azure DevOps push API
      console.log('[Azure DevOps] Building changes array from files...')
      const changes = files.map((file) => {
        if (file.status === DraftStatus.Deleted) {
          return {
            changeType: 'delete',
            item: {
              path: `/${file.path}`,
            },
          }
        }
        else if (file.status === DraftStatus.Created) {
          return {
            changeType: 'add',
            item: {
              path: `/${file.path}`,
            },
            newContent: {
              content: file.content,
              contentType: file.encoding === 'base64' ? 'base64encoded' : 'rawtext',
            },
          }
        }
        else {
          // Modified
          return {
            changeType: 'edit',
            item: {
              path: `/${file.path}`,
            },
            newContent: {
              content: file.content,
              contentType: file.encoding === 'base64' ? 'base64encoded' : 'rawtext',
            },
          }
        }
      })

      console.log('[Azure DevOps] Changes prepared:', changes.length, 'changes')
      console.log('[Azure DevOps] Making push API call to create commit...')

      // Create a push with commits
      // POST https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pushes?api-version=7.1
      console.log('[Azure DevOps] Making push API call with', changes.length, 'changes')
      const pushData = await $api(`/git/repositories/${repo}/pushes?api-version=7.1`, {
        method: 'POST',
        body: {
          refUpdates: [
            {
              name: `refs/heads/${branch}`,
              oldObjectId,
            },
          ],
          commits: [
            {
              comment: message,
              author: {
                name: authorName,
                email: authorEmail,
                date: new Date().toISOString(),
              },
              changes,
            },
          ],
        },
      })

      const commitId = pushData.commits[0].commitId
      console.log('[Azure DevOps] Push successful, commit ID:', commitId)

      return {
        success: true,
        commitSha: commitId,
        url: `https://dev.azure.com/${organization}/${project}/_git/${repo}/commit/${commitId}`,
      }
    }
    catch (error: unknown) {
      // Azure DevOps specific error formatting
      const azError = error as AzureDevOpsError
      const errorMessage = azError?.data?.message || azError?.message || 'Unknown error'
      const errorDetails = azError?.data?.typeKey ? ` (${azError.data.typeKey})` : ''

      console.error(`Failed to commit files to Azure DevOps: ${errorMessage}${errorDetails}`, error)

      if (process.env.NODE_ENV === 'development') {
        alert(`Failed to commit files to Azure DevOps:\n${errorMessage}${errorDetails}`)
      }

      return null
    }
  }

  function getRepositoryUrl() {
    return `https://dev.azure.com/${organization}/${project}/_git/${repo}`
  }

  function getBranchUrl() {
    return `https://dev.azure.com/${organization}/${project}/_git/${repo}?version=GB${branch}`
  }

  function getCommitUrl(sha: string) {
    return `https://dev.azure.com/${organization}/${project}/_git/${repo}/commit/${sha}`
  }

  function getFileUrl(_feature: StudioFeature, fsPath: string) {
    const path = joinURL(rootDir, fsPath)

    // Azure DevOps file URLs
    // https://dev.azure.com/{organization}/{project}/_git/{repo}?path={path}&version=GB{branch}
    return `https://dev.azure.com/${organization}/${project}/_git/${repo}?path=/${path}&version=GB${branch}`
  }

  function getRepositoryInfo() {
    return {
      owner: organization!,
      repo,
      branch,
      provider: 'azure-devops' as const,
    }
  }

  return {
    fetchFile,
    commitFiles,
    getRepositoryUrl,
    getBranchUrl,
    getCommitUrl,
    getFileUrl,
    getRepositoryInfo,
  }
}
