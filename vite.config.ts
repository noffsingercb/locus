import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'

/**
 * Serve `/why` from `public/why/index.html`, the way Cloudflare Pages does.
 *
 * Two separate things used to break the written pages locally, and only the
 * first is Vite's documented behaviour:
 *
 *  1. `appType: 'spa'` (the default) installs a history fallback that rewrites
 *     every unmatched path to `/index.html`, so each footer link rendered the
 *     applet. `appType: 'mpa'` below turns that off.
 *  2. With the fallback gone, `vite preview`'s static handler answers `/why/`
 *     and `/why/index.html` but 404s on a bare `/why`, because it does not
 *     resolve a directory index for an extensionless path.
 *
 * Cloudflare Pages resolves both, so production was always fine -- but "trust
 * me, production is fine" is not a testable claim, and the footer nav could not
 * be checked by hand. This middleware makes dev and preview match the host.
 *
 * It is a dev/preview concern only: nothing here runs in, or changes, the
 * build output.
 */
function directoryIndexRoutes(): Plugin {
	const rewrite = (root: string): Connect.NextHandleFunction => {
		return (req, _res, next) => {
			const url = req.url ?? '/'
			const path = url.split('?')[0]
			const extensionless = !/\.[^/]+$/.test(path)
			if (path !== '/' && !path.endsWith('/') && extensionless) {
				if (existsSync(join(root, path, 'index.html'))) {
					req.url = `${path}/index.html${url.slice(path.length)}`
				}
			}
			next()
		}
	}

	return {
		name: 'locus-directory-index-routes',
		// In dev the pages are still in public/, which Vite serves at the root.
		configureServer(server) {
			server.middlewares.use(rewrite(join(server.config.root, 'public')))
		},
		// In preview they have been copied to the build output.
		configurePreviewServer(server) {
			server.middlewares.use(rewrite(resolve(server.config.root, server.config.build.outDir)))
		},
	}
}

export default defineConfig({
	// The site is a set of hand-written static pages plus one applet entry, not
	// a single-page app, so the SPA history fallback is actively wrong here.
	// See directoryIndexRoutes above for the whole story. Build output is
	// identical either way.
	appType: 'mpa',
	plugins: [directoryIndexRoutes()],
	// MapLibre v6 resolves its ESM worker relative to the package. Vite 5's dev
	// pre-bundler otherwise rewrites the package without carrying that worker
	// beside the optimized module, producing a blank map at runtime.
	optimizeDeps: {
		exclude: ['maplibre-gl'],
	},
	build: {
		outDir: 'dist',
	},
})
