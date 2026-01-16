import { eventHandler, getCookie, deleteCookie, sendRedirect } from 'h3'
import type { StudioUser } from 'nuxt-studio/app'
import { setInternalStudioUserSession } from '../../utils/session'

export default eventHandler(async (event) => {
  const token = process.env.STUDIO_AZURE_DEVOPS_TOKEN

  if (!token) {
    throw new Error('STUDIO_AZURE_DEVOPS_TOKEN is not set')
  }

  // For Azure DevOps, we use PAT authentication
  // Set a basic session with the token
  // User details will be fetched when needed by the Azure DevOps provider
  await setInternalStudioUserSession(event, {
    name: 'Azure DevOps User',
    email: 'user@example.com',
    provider: 'azure-devops' as unknown as StudioUser['provider'],
    accessToken: token,
  })

  // Redirect back to stored redirect or home
  const redirect = decodeURIComponent(getCookie(event, 'studio-redirect') || '')
  deleteCookie(event, 'studio-redirect')

  // Make sure the redirect is a valid relative path (avoid also // which is not a valid URL)
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return sendRedirect(event, redirect)
  }

  return sendRedirect(event, '/')
})
