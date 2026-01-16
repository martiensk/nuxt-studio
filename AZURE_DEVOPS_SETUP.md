# Azure DevOps Integration Setup

This document describes how to configure Nuxt Studio to work with Azure DevOps Repositories using PAT (Personal Access Token) authentication.

## Features

- ✅ Cloud-only Azure DevOps support (dev.azure.com)
- ✅ PAT token authentication with `az_pat_` prefix detection
- ✅ Automatic commit author attribution from PAT owner
- ✅ Co-author support for audit trails
- ✅ Full file operations (create, edit, delete)
- ✅ Azure DevOps-specific error handling

## Prerequisites

1. An Azure DevOps organization
2. A project within that organization
3. A Git repository in the project
4. A Personal Access Token (PAT) with appropriate permissions

## Step 1: Create Azure DevOps PAT

1. Go to your Azure DevOps organization: `https://dev.azure.com/{organization}`
2. Click on **User Settings** (top right) → **Personal access tokens**
3. Click **+ New Token**
4. Configure the token:
   - **Name**: `Nuxt Studio` (or any descriptive name)
   - **Organization**: Select your organization
   - **Expiration**: Choose appropriate expiration date
   - **Scopes**: Select **Custom defined** and enable:
     - ✅ **Code** → **Read & write** (for repository access and commits)
     - ✅ **User Profile** → **Read** (for author attribution)
5. Click **Create**
6. **Important**: Copy the generated token immediately (you won't be able to see it again)

### Token Format

For consistency with the implementation, prefix your PAT with `az_pat_`:

```
az_pat_YOUR_ACTUAL_TOKEN_HERE
```

This prefix helps the system identify it as an Azure DevOps PAT token.

## Step 2: Configure Nuxt Studio

### Environment Variables

Add the following environment variable to your `.env` file:

```bash
STUDIO_AZURE_DEVOPS_TOKEN=az_pat_YOUR_ACTUAL_TOKEN_HERE
```

### Nuxt Configuration

Update your `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    'nuxt-studio'
  ],
  
  studio: {
    // Studio admin route (default: '/_studio')
    route: '/_studio',
    
    // Azure DevOps repository configuration
    repository: {
      provider: 'azure-devops',
      organization: 'myorg',           // Your Azure DevOps organization name
      project: 'MyProject',            // Your project name (case-sensitive)
      repo: 'my-repo',                 // Your repository name
      branch: 'main',                  // The branch to commit to (default: main)
      rootDir: 'content',              // Root directory for content (default: '')
      owner: 'myorg',                  // Same as organization (for compatibility)
    }
  }
})
```

### Configuration Fields Explanation

- **provider**: Must be `'azure-devops'`
- **organization**: Your Azure DevOps organization name (visible in URL: `dev.azure.com/{organization}`)
- **project**: Your project name (visible in Azure DevOps UI and URL)
- **repo**: Repository name (visible in Repos section)
- **branch**: Target branch for commits (default: `'main'`)
- **rootDir**: Root directory within the repository for content files (default: `''`)
- **owner**: Same as organization (used for compatibility with git provider interface)

## Step 3: Verify Setup

### Find Your Configuration Values

1. **Organization**: Look at your Azure DevOps URL → `https://dev.azure.com/{THIS_IS_YOUR_ORG}`
2. **Project**: Navigate to your project → visible in the project selector
3. **Repository**: Go to **Repos** → **Files** → repository name is shown at the top

Example URL structure:
```
https://dev.azure.com/contoso/ContosoProject/_git/webapp
                      ^^^^^^^^  ^^^^^^^^^^^^^       ^^^^^^
                      org       project             repo
```

### Test the Integration

1. Run your Nuxt application:
   ```bash
   npm run dev
   ```

2. Navigate to the Studio admin route (default: `/_studio`)

3. Try editing a content file

4. Commit the changes - you should see them pushed to your Azure DevOps repository

## How It Works

### Authentication

Azure DevOps uses **Basic Authentication** with PAT tokens:
- Username: empty string
- Password: your PAT token
- Header: `Authorization: Basic {base64(:token)}`

### Commit Process

1. Fetches the latest commit SHA for the target branch
2. Creates file changes (add/edit/delete operations)
3. Pushes changes using Azure Repos Push API
4. Adds co-author metadata for audit trails:
   - PAT owner as primary author
   - Original user as co-author (if different)
   - Nuxt Studio as co-author

### File Operations

The Azure DevOps provider uses the Azure Repos REST API v7.1:

- **Fetch File**: `GET /git/repositories/{repo}/items?path={path}`
- **Commit Files**: `POST /git/repositories/{repo}/pushes`

## API Endpoints Used

| Operation | Endpoint | Purpose |
|-----------|----------|---------|
| Get File | `/git/repositories/{repo}/items` | Retrieve file content |
| Get Refs | `/git/repositories/{repo}/refs` | Get branch commit SHA |
| Push Changes | `/git/repositories/{repo}/pushes` | Commit and push files |
| Get Profile | `https://app.vssps.visualstudio.com/_apis/profile/profiles/me` | Get PAT owner info |

All endpoints use API version `7.1`.

## Troubleshooting

### Error: "Azure DevOps provider requires organization and project to be specified"

**Solution**: Ensure both `organization` and `project` are set in your repository configuration.

### Error: "Branch {branch} not found"

**Solution**: Verify the branch name is correct. Branch names are case-sensitive.

### Error: 401 Unauthorized

**Solution**: 
- Verify your PAT token is correct
- Check that your PAT has the required scopes (Code: Read & Write)
- Ensure the PAT hasn't expired

### Error: 404 Not Found

**Solution**:
- Verify organization, project, and repository names are correct
- Check that the repository exists and you have access to it
- Ensure the names match exactly (case-sensitive)

### Commits show wrong author

**Solution**: 
- Ensure your PAT has `User Profile (Read)` scope enabled
- The system will fetch your profile to use as commit author

## Limitations

- ❌ **No OAuth Support**: Only PAT authentication is supported
- ❌ **Cloud Only**: On-premises TFS/Azure DevOps Server is not supported
- ❌ **No Multi-Auth**: Cannot combine with GitHub/GitLab OAuth (PAT-only workflow)

## Security Best Practices

1. **Token Expiration**: Set reasonable expiration dates for PATs (e.g., 90 days)
2. **Minimal Scopes**: Only grant required permissions (Code: Read & Write, User Profile: Read)
3. **Environment Variables**: Never commit PAT tokens to version control
4. **Token Rotation**: Regularly rotate PAT tokens
5. **Access Control**: Use Azure DevOps permissions to limit who can create PATs

## Example Complete Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/content', 'nuxt-studio'],
  
  studio: {
    route: '/_studio',
    repository: {
      provider: 'azure-devops',
      organization: 'contoso',
      project: 'ContosoWeb',
      repo: 'website',
      branch: 'main',
      rootDir: 'content',
      owner: 'contoso',
    }
  }
})
```

```bash
# .env
STUDIO_AZURE_DEVOPS_TOKEN=az_pat_abcdefghijklmnopqrstuvwxyz1234567890
```

## Additional Resources

- [Azure DevOps REST API Documentation](https://learn.microsoft.com/en-us/rest/api/azure/devops/)
- [Azure Repos Git REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/)
- [Personal Access Tokens](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
