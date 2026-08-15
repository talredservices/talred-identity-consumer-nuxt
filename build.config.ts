import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/module',
    'src/runtime/index',
    'src/runtime/client',
    'src/runtime/server/identity',
    'src/runtime/server/api/authorize.get',
    'src/runtime/server/api/callback.get',
    'src/runtime/server/api/session.get',
    'src/runtime/server/api/logout.post',
    'src/runtime/server/api/account-authorize.get',
    'src/runtime/server/api/account-logout.get',
    'src/runtime/client/routes',
    'src/runtime/client/identity',
    'src/runtime/client/session',
    'src/runtime/client/middleware',
  ],
  declaration: true,
  clean: true,
  externals: ['@nuxt/kit', '@nuxt/schema', 'h3', 'nitropack/runtime/config', 'nuxt/app', 'ofetch', 'vue', 'zod'],
  rollup: {
    emitCJS: false,
  },
})
