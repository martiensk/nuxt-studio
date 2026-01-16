export default defineNuxtConfig({
  extends: ['docus'],
  modules: [
    '@nuxt/ui',
    '@nuxt/content',
    'nuxt-studio',
  ],
  devtools: { enabled: true },
  content: {
    experimental: {
      sqliteConnector: 'native',
    },
  },
  compatibilityDate: '2025-08-26',
  studio: {
    route: '/admin',
    dev: false,
    auth: {
      github: {
        clientId: 'placeholder',
        clientSecret: 'placeholder',
      },
    },
    repository: {
      provider: 'azure-devops',
      organization: 'annexiosrc', // Azure DevOps organization name
      project: 'Annexio', // Azure DevOps project name
      repo: 'nuxt-studio', // Repository name
      owner: 'annexiosrc', // Same as organization
      branch: 'main',
      rootDir: 'playground/docus',
    },
  },
})
