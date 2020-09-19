import path from 'path'
import pMap from 'p-map'
import semver, { ReleaseType } from 'semver'
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
import type { lerna_logger_type } from './lerna_logger_type'
import type { lerna_project_type } from './lerna_project_type'
import type { lerna_options_type } from './lerna_options_type'
import type { lerna_packages_type } from './lerna_packages_type'
import type { lerna_package_type } from './lerna_package_type'
export type lerna_conf_type = {
	get(prop:string):unknown
	set(prop:string, value:unknown, opt:unknown):unknown
}
export type getDistTag = ()=>string
export type detectFromPackage_type = ()=>unknown
export type runPackageLifecycle_type = (manifest_type, str)=>void
export type confirmPublish_type = ()=>boolean
export class PublishSubmoduleCommand extends publish.PublishCommand {
	argv:unknown
	options?:lerna_options_type
	execOpts:unknown
	logger?:lerna_logger_type
	npmSession?:string
	userAgent?:string
	conf?:lerna_conf_type
	otpCache:unknown
	getDistTag?:getDistTag
	hasRootedLeaf?:boolean
	packageGraph?:lerna_packages_type
	project?:lerna_project_type
	runPackageLifecycle?:runPackageLifecycle_type
	runRootLifecycle:unknown
	detectFromPackage?:detectFromPackage_type
	updates?:lerna_packages_type
	updatesVersions?:Map<any, any>
	packagesToPublish?:lerna_package_type[]
	confirmPublish?:()=>boolean
	runner?:Promise<any>
	tagPrefix?:string
	constructor(argv) {
		super(argv)
	}
	async initialize() {
		const project = this.project as lerna_project_type
		const logger = this.logger as lerna_logger_type
		const options = this.options as lerna_options_type
		const conf = this.conf as lerna_conf_type
		if (!project.isIndependent()) {
			logger.info('current version', project.version)
		}
		if (options.canary) {
			logger.info('canary', 'enabled')
		}
		if (options.requireScripts) {
			logger.info('require-scripts', 'enabled')
		}
		// npmSession and user-agent are consumed by npm-registry-fetch (via libnpmpublish)
		logger.verbose('session', this.npmSession)
		logger.verbose('user-agent', this.userAgent)
		this.conf = npmConf({
			lernaCommand: 'publish',
			_auth: options.legacyAuth,
			npmSession: this.npmSession,
			npmVersion: this.userAgent,
			otp: options.otp,
			registry: options.registry,
			'ignore-prepublish': options.ignorePrepublish,
			'ignore-scripts': options.ignoreScripts,
		})
		// cache to hold a one-time-password across publishes
		this.otpCache = { otp: conf.get('otp') }
		conf.set('user-agent', this.userAgent, 'cli')
		if (conf.get('registry') === 'https://registry.yarnpkg.com') {
			logger.warn('', 'Yarn\'s registry proxy is broken, replacing with public npm registry')
			logger.warn('', 'If you don\'t have an npm token, you should exit and run `npm login`')
			conf.set('registry', 'https://registry.npmjs.org/', 'cli')
		}
		// inject --dist-tag into opts, if present
		const distTag = (this.getDistTag as getDistTag)()
		if (distTag) {
			conf.set('tag', distTag.trim(), 'cli')
		}
		// a "rooted leaf" is the regrettable pattern of adding "." to the "packages" config in lerna.json
		this.hasRootedLeaf = (this.packageGraph as lerna_packages_type).has(project.manifest.name)
		if (this.hasRootedLeaf) {
			logger.info('publish', 'rooted leaf detected, skipping synthetic root lifecycles')
		}
		this.runPackageLifecycle = runLifecycle.createRunner(options)
		// don't execute recursively if run from a poorly-named script
		this.runRootLifecycle =
			/^(pre|post)?publish$/.test(process.env.npm_lifecycle_event as string)
			? stage=>{
				logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
			}
			: stage=>(this.runPackageLifecycle as runPackageLifecycle_type)(project.manifest, stage)
		let result
		if (options.bump === 'from-git') {
			result = await this.detectFromGit()
		} else if (options.bump === 'from-package') {
			result = await (this.detectFromPackage as detectFromPackage_type)()
		} else if (options.canary) {
			result = await this.detectCanaryVersions()
		} else {
			result = await new VersionSubmoduleCommand(this.argv)
		}
		if (!result) {
			// early return from nested VersionCommand
			return false
		}
		if (!result.updates.length) {
			logger.success('No changed packages to publish')
			// still exits zero, aka "ok"
			return false
		}
		// (occasionally) redundant private filtering necessary to handle nested VersionCommand
		this.updates = result.updates
		this.updatesVersions = new Map(result.updatesVersions)
		this.packagesToPublish = (this.updates as lerna_packages_type)
			.map(({ pkg })=>pkg)
			.filter(pkg=>!pkg.private)
		if (options.contents) {
			// globally override directory to publish
			for (const pkg of this.packagesToPublish) {
				pkg.contents = options.contents
			}
		}
		if (result.needsConfirmation) {
			// only confirm for --canary, bump === "from-git",
			// or bump === "from-package", as VersionCommand
			// has its own confirmation prompt
			return (this.confirmPublish as confirmPublish_type)()
		}
		return true
	}
	execOptsPkg(pkg) {
		return Object.assign({}, this.execOpts, { cwd: pkg.location })
	}
	async verifyWorkingTreeClean() {
		const packagesToPublish = this.packagesToPublish as lerna_package_type[]
		return Promise.all(packagesToPublish.map(pkg=>{
			return describeRef(this.execOptsPkg(pkg)).then(checkWorkingTree.throwIfUncommitted)
		}))
	}
	async detectFromGit() {
		const project = this.project as lerna_project_type
		const logger = this.logger as lerna_logger_type
		const packagesToPublish = this.packagesToPublish as lerna_package_type[]
		const packageGraph = this.packageGraph as lerna_packages_type
		const matchingPattern = project.isIndependent() ? '*@*' : `${this.tagPrefix}*.*.*`
		await this.verifyWorkingTreeClean()
		const updates = await Promise.all(packagesToPublish.map(pkg=>{
			const execOpts = this.execOptsPkg(pkg)
			const taggedPackageNames = getCurrentTags(execOpts, matchingPattern)
			if (!taggedPackageNames.length) {
				logger.notice('from-git', 'No tagged release found')
				return []
			}
			if (project.isIndependent()) {
				return taggedPackageNames.map(name=>packageGraph.get(name))
			}
			return getTaggedPackages(packageGraph, project.rootPath, execOpts)
		}))
		const updatesVersions = updates.map(
			({ pkg })=>[pkg.name, pkg.version]
		)
		return {
			updates,
			updatesVersions,
			needsConfirmation: true,
		}
	}
	annotateGitHead() {
		const packagesToPublish = this.packagesToPublish as lerna_package_type[]
		const logger = this.logger as lerna_logger_type
		try {
			for (const pkg of packagesToPublish) {
				// provide gitHead property that is normally added during npm publish
				pkg.set('gitHead', getCurrentSHA(this.execOptsPkg(pkg)))
			}
		} catch (err) {
			// from-package should be _able_ to run without git, but at least we tried
			logger.silly('EGITHEAD', err.message)
			logger.notice(
				'FYI',
				'Unable to set temporary gitHead property, it will be missing from registry metadata'
			)
		}
		// writing changes to disk handled in serializeChanges()
	}
	async detectCanaryVersions() {
		const options = this.options as lerna_options_type
		const packageGraph = this.packageGraph as lerna_packages_type
		const project = this.project as lerna_project_type
		const {
			bump = 'prepatch',
			preid = 'alpha',
			ignoreChanges,
			forcePublish,
			includeMergedTags,
		} = options
		// "prerelease" and "prepatch" are identical, for our purposes
		const release:string =
			bump.startsWith('pre')
			? bump.replace('release', 'patch')
			: `pre${bump}`
		// attempting to publish a canary release with local changes is not allowed
		await this.verifyWorkingTreeClean()
		// find changed packages since last release, if any
		const updates_a2 = await Promise.all(
			packageGraph.rawPackageList.map(
				pkg=>{
					return collectUpdatesSubmodule(
						pkg,
						packageGraph.rawPackageList,
						packageGraph,
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
		) as {pkg: lerna_package_type}[][]
		const updates = (updates_a2.flat())
			.filter(({ pkg })=>!pkg.private)
		const makeVersion = ({ lastVersion, refCount, sha })=>{
			// the next version is bumped without concern for preid or current index
			const nextVersion = semver.inc(lastVersion, release.replace('pre', '') as ReleaseType)
			// semver.inc() starts a new prerelease at .0, git describe starts at .1
			// and build metadata is always ignored when comparing dependency ranges
			return `${nextVersion}-${preid}.${Math.max(0, refCount - 1)}+${sha}`
		}
		let updatesVersions
		if (project.isIndependent()) {
			// each package is described against its tags only
			updatesVersions = await pMap(updates, async ({ pkg: in_pkg })=>{
				const pkg = in_pkg as lerna_package_type
				const {
					lastVersion = pkg.version,
					refCount,
					sha,
				} = await describeRef(
					{
						match: `${pkg.name}@*`,
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
				updates.map(async ({ pkg })=>{
					const { cwd } = this.execOptsPkg(pkg)
					const {
						lastVersion = pkg.version,
						refCount,
						sha,
					} = await describeRef(
						{
							match: `${this.tagPrefix}*.*.*`,
							cwd,
						},
						includeMergedTags
					)
					const version = await makeVersion({
						lastVersion,
						refCount,
						sha,
					})
					return updates.map(({ pkg })=>[pkg.name, version])
				}))
		}
		return {
			updates,
			updatesVersions,
			needsConfirmation: true,
		}
	}
	async resetChanges() {
		const logger = this.logger as lerna_logger_type
		const project = this.project as lerna_project_type
		const packagesToPublish = this.packagesToPublish as lerna_package_type[]
		const gitCheckout_ = (dirtyManifests, execOpts)=>{
			return gitCheckout(dirtyManifests, {}, execOpts).catch(err=>{
				logger.silly('EGITCHECKOUT', err.message)
				logger.notice('FYI', 'Unable to reset working tree changes, this probably isn\'t a git repo.')
			})
		}
		// the package.json files are changed (by gitHead if not --canary)
		// and we should always __attempt_ to leave the working tree clean
		return await Promise.all([
			gitCheckout_([project.manifest], this.execOpts),
			...packagesToPublish.map(pkg=>{
				const execOpts = this.execOptsPkg(pkg)
				const { cwd } = execOpts
				return gitCheckout_(
					[path.relative(cwd, pkg.manifestLocation)],
					execOpts)
			})
		])
	}
}
