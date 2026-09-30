import { existsSync, readFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
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

const WORKER_FILE = 'maplibre-gl-worker.mjs'
const WORKER_SOURCE = join('node_modules', 'maplibre-gl', 'dist', WORKER_FILE)

/**
 * Put MapLibre's worker where MapLibre will look for it.
 *
 * MapLibre v6 locates its worker at runtime, not at import time:
 *
 *     let e = import.meta.url
 *     if (!/^https?:/.test(e)) return ''
 *     return new URL('./maplibre-gl-worker.mjs', e).href
 *
 * The filename is assembled from a variable, so Vite's asset scanner -- which
 * only recognises a literal `new URL('./file.js', import.meta.url)` -- never
 * sees it, never emits the file, and never rewrites the reference. In a build,
 * `import.meta.url` is the entry chunk at `/assets/index-<hash>.js`, so
 * MapLibre asks for `/assets/maplibre-gl-worker.mjs` and gets a 404. The map
 * then renders its background, its controls and its attribution, and no tiles
 * at all, because decoding them is the only thing the worker does.
 *
 * Dev escapes this by accident: `optimizeDeps.exclude` below leaves the
 * package unbundled, so `import.meta.url` is the real file in node_modules and
 * the worker sits beside it on disk. That is why this only ever appeared in a
 * built bundle -- which is to say, in production.
 *
 * There is no supported override; v6 exposes no `workerUrl` or `workerClass`.
 * So emit the file under its exact expected name, next to the entry chunk.
 * It cannot be hashed, because the name is hard-coded upstream.
 */
function maplibreWorkerAsset(): Plugin {
	let assetsDir = 'assets'

	return {
		name: 'locus-maplibre-worker-asset',
		apply: 'build',
		configResolved(config) {
			assetsDir = config.build.assetsDir
		},
		generateBundle(_options, bundle) {
			if (!existsSync(WORKER_SOURCE)) {
				// Fail the build rather than ship a map that silently draws nothing.
				this.error(
					`${WORKER_SOURCE} is missing. MapLibre's worker must be emitted beside the ` +
						`entry chunk or the built map renders no tiles. Has maplibre-gl moved its dist layout?`,
				)
				return
			}

			// Derive the directory from the entry chunk rather than assuming, since
			// that is literally the path MapLibre resolves `./` against.
			const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry)
			const directory = entry === undefined ? assetsDir : posix.dirname(entry.fileName)

			this.emitFile({
				type: 'asset',
				fileName: directory === '.' ? WORKER_FILE : posix.join(directory, WORKER_FILE),
				source: readFileSync(WORKER_SOURCE),
			})
		},
	}
}

export default defineConfig({
	// The site is a set of hand-written static pages plus one applet entry, not
	// a single-page app, so the SPA history fallback is actively wrong here.
	// See directoryIndexRoutes above for the whole story. Build output is
	// identical either way.
	appType: 'mpa',
	plugins: [directoryIndexRoutes(), maplibreWorkerAsset()],
	// MapLibre v6 resolves its ESM worker relative to the package. Vite 5's dev
	// pre-bundler otherwise rewrites the package without carrying that worker
	// beside the optimized module, producing a blank map at runtime. See
	// maplibreWorkerAsset above for the build-side half of the same problem.
	optimizeDeps: {
		exclude: ['maplibre-gl'],
	},
	build: {
		outDir: 'dist',
	},
})
