import path from 'path'
import pMap from 'p-map'
import semver from 'semver'
import publish from '@lerna/publish'
import gitCheckout from '@lerna/publish/lib/git-checkout.js'
import getCurrentSHA from '@lerna/publish/lib/get-current-sha.js'
import getCurrentTags from '@lerna/publish/lib/get-current-tags.js'
import getTaggedPackages from '@lerna/publish/lib/get-tagged-packages.js'
import runLifecycle from '@lerna/run-lifecycle'
import checkWorkingTree from '@lerna/check-working-tree'
import describeRef from '@lerna/describe-ref'
import npmConf from '@lerna/npm-conf'
import { VersionSubmoduleCommand } from './version'
import { collectUpdatesSubmodule } from './lib'

export class PublishSubmoduleCommand extends publish.PublishCommand {
	argv: any
	options: any
	execOpts: any
	logger: any
	npmSession: any
	userAgent: any
	conf: any
	otpCache: any
	getDistTag: () => string
	hasRootedLeaf: boolean
	packageGraph: any
	project: any
	runPackageLifecycle: any
	runRootLifecycle: any
	detectFromPackage: () => any
	updates: any
	updatesVersions: Map<any, any>
	packagesToPublish: any
	confirmPublish: () => boolean
	runner: Promise<any>
	tagPrefix: string

	constructor(argv) {
		super(argv)
	}

	async initialize() {
		if (!this.project.isIndependent()) {
			this.logger.info('current version', this.project.version);
		}
		if (this.options.canary) {
			this.logger.info('canary', 'enabled')
		}
		if (this.options.requireScripts) {
			this.logger.info('require-scripts', 'enabled')
		}
		// npmSession and user-agent are consumed by npm-registry-fetch (via libnpmpublish)
		this.logger.verbose('session', this.npmSession)
		this.logger.verbose('user-agent', this.userAgent)
		this.conf = npmConf({
			lernaCommand: 'publish',
			_auth: this.options.legacyAuth,
			npmSession: this.npmSession,
			npmVersion: this.userAgent,
			otp: this.options.otp,
			registry: this.options.registry,
			'ignore-prepublish': this.options.ignorePrepublish,
			'ignore-scripts': this.options.ignoreScripts,
		});
		// cache to hold a one-time-password across publishes
		this.otpCache = { otp: this.conf.get('otp') }
		this.conf.set('user-agent', this.userAgent, 'cli')
		if (this.conf.get('registry') === 'https://registry.yarnpkg.com') {
			this.logger.warn('', "Yarn's registry proxy is broken, replacing with public npm registry")
			this.logger.warn('', "If you don't have an npm token, you should exit and run `npm login`")
			this.conf.set('registry', 'https://registry.npmjs.org/', 'cli')
		}
		// inject --dist-tag into opts, if present
		const distTag = this.getDistTag()
		if (distTag) {
			this.conf.set('tag', distTag.trim(), 'cli')
		}
		// a "rooted leaf" is the regrettable pattern of adding "." to the "packages" config in lerna.json
		this.hasRootedLeaf = this.packageGraph.has(this.project.manifest.name)
		if (this.hasRootedLeaf) {
			this.logger.info('publish', 'rooted leaf detected, skipping synthetic root lifecycles')
		}
		this.runPackageLifecycle = runLifecycle.createRunner(this.options)
		// don't execute recursively if run from a poorly-named script
		this.runRootLifecycle =
			/^(pre|post)?publish$/.test(process.env.npm_lifecycle_event)
				? stage => {
					this.logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
				}
				: stage => this.runPackageLifecycle(this.project.manifest, stage)
		let result
		if (this.options.bump === "from-git") {
			result = await this.detectFromGit()
		} else if (this.options.bump === "from-package") {
			result = await this.detectFromPackage()
		} else if (this.options.canary) {
			result = await this.detectCanaryVersions()
		} else {
			result = await new VersionSubmoduleCommand(this.argv)
		}
		if (!result) {
			// early return from nested VersionCommand
			return false;
		}

		if (!result.updates.length) {
			this.logger.success('No changed packages to publish');

			// still exits zero, aka "ok"
			return false;
		}

		// (occasionally) redundant private filtering necessary to handle nested VersionCommand
		this.updates = result.updates
		this.updatesVersions = new Map(result.updatesVersions)

		this.packagesToPublish = this.updates
			.map(({ pkg }) => pkg)
			.filter(pkg => !pkg.private)

		if (this.options.contents) {
			// globally override directory to publish
			for (const pkg of this.packagesToPublish) {
				pkg.contents = this.options.contents
			}
		}

		if (result.needsConfirmation) {
			// only confirm for --canary, bump === "from-git",
			// or bump === "from-package", as VersionCommand
			// has its own confirmation prompt
			return this.confirmPublish()
		}

		return true;
	}

	execOptsPkg(pkg) {
		return Object.assign({}, this.execOpts, { cwd: pkg.location })
	}

	async verifyWorkingTreeClean() {
		return Promise.all(this.packagesToPublish.map(pkg => {
			return describeRef(this.execOptsPkg(pkg)).then(checkWorkingTree.throwIfUncommitted)
		}))
	}

	async detectFromGit() {
		const matchingPattern = this.project.isIndependent() ? '*@*' : `${ this.tagPrefix }*.*.*`
		await this.verifyWorkingTreeClean()
		const updates = await Promise.all(this.packagesToPublish.map(pkg => {
			const execOpts = this.execOptsPkg(pkg)
			const taggedPackageNames = getCurrentTags(execOpts, matchingPattern)
			if (!taggedPackageNames.length) {
				this.logger.notice('from-git', 'No tagged release found')
				return []
			}
			if (this.project.isIndependent()) {
				return taggedPackageNames.map(name => this.packageGraph.get(name))
			}
			return getTaggedPackages(this.packageGraph, this.project.rootPath, execOpts)
		}))
		const updatesVersions = updates.map(
			({ pkg }) => [pkg.name, pkg.version]
		)
		return {
			updates,
			updatesVersions,
			needsConfirmation: true,
		}
	}

	annotateGitHead() {
		try {
			for (const pkg of this.packagesToPublish) {
				// provide gitHead property that is normally added during npm publish
				pkg.set('gitHead', getCurrentSHA(this.execOptsPkg(pkg)))
			}
		} catch (err) {
			// from-package should be _able_ to run without git, but at least we tried
			this.logger.silly('EGITHEAD', err.message)
			this.logger.notice(
				'FYI',
				'Unable to set temporary gitHead property, it will be missing from registry metadata'
			)
		}
		// writing changes to disk handled in serializeChanges()
	}

	async detectCanaryVersions() {
		const {
			bump = 'prepatch',
			preid = 'alpha',
			ignoreChanges,
			forcePublish,
			includeMergedTags,
		} = this.options
		// "prerelease" and "prepatch" are identical, for our purposes
		const release = bump.startsWith('pre') ? bump.replace('release', 'patch') : `pre${ bump }`
		// attempting to publish a canary release with local changes is not allowed
		await this.verifyWorkingTreeClean()
		// find changed packages since last release, if any
		const updatesA2 = await Promise.all(
			this.packageGraph.rawPackageList.map(
				pkg => {
					return collectUpdatesSubmodule(
						pkg,
						this.packageGraph.rawPackageList,
						this.packageGraph,
						this.execOptsPkg(pkg),
						{
							bump: 'prerelease',
							canary: true,
							ignoreChanges,
							forcePublish,
							includeMergedTags,
						}
					)
				}
			)
		)
		const updates = ([].concat(...updatesA2))
			.filter(({ pkg }) => !pkg.private)
		const makeVersion = ({ lastVersion, refCount, sha }) => {
			// the next version is bumped without concern for preid or current index
			const nextVersion = semver.inc(lastVersion, release.replace('pre', ''))
			// semver.inc() starts a new prerelease at .0, git describe starts at .1
			// and build metadata is always ignored when comparing dependency ranges
			return `${ nextVersion }-${ preid }.${ Math.max(0, refCount - 1) }+${ sha }`
		}
		let updatesVersions
		if (this.project.isIndependent()) {
			// each package is described against its tags only
			updatesVersions = await pMap(updates, async ({ pkg }) => {
				const {
					lastVersion = pkg.version,
					refCount,
					sha,
				} = await describeRef(
					{
						match: `${ pkg.name }@*`,
						cwd: pkg.location,
					},
					includeMergedTags,
				)
				// an unpublished package will have no reachable git tag
				const version = await makeVersion({
					lastVersion,
					refCount,
					sha,
				})
				return [pkg.name, version]
			})
		} else {
			// all packages are described against the last tag
			updatesVersions = await Promise.all(
				updates.map(async ({ pkg }) => {
					const { cwd } = this.execOptsPkg(pkg)
					const {
						lastVersion = pkg.version,
						refCount,
						sha,
					} = await describeRef(
						{
							match: `${ this.tagPrefix }*.*.*`,
							cwd,
						},
						includeMergedTags
					)
					const version = await makeVersion({
						lastVersion,
						refCount,
						sha,
					})
					return updates.map(({ pkg }) => [pkg.name, version])
				}))
		}
		return {
			updates,
			updatesVersions,
			needsConfirmation: true,
		}
	}

	async resetChanges() {
		console.debug('resetChanges|debug|1')
		const gitCheckout_ = (dirtyManifests, execOpts) => {
			return gitCheckout(dirtyManifests, execOpts).catch(err => {
				this.logger.silly('EGITCHECKOUT', err.message)
				this.logger.notice('FYI', 'Unable to reset working tree changes, this probably isn\'t a git repo.')
			})
		}
		// the package.json files are changed (by gitHead if not --canary)
		// and we should always __attempt_ to leave the working tree clean
		return await Promise.all([
			gitCheckout_([this.project.manifest], this.execOpts),
			...this.packagesToPublish.map(pkg => {
				const execOpts = this.execOptsPkg(pkg)
				const { cwd } = execOpts
				return gitCheckout_(
					[path.relative(cwd, pkg.manifestLocation)],
					execOpts)
			})
		])
	}
}
