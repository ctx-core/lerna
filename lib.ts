import os from 'os'
import path from 'path'
import log from 'npmlog'
import dedent from 'dedent'
import pMap from 'p-map'
import pPipe from 'p-pipe'
import semver from 'semver'
import pWaterfall from 'p-waterfall'
import { VersionCommand } from '@lerna/version'
import { PublishCommand } from '@lerna/publish'
import gitCheckout from '@lerna/publish/lib/git-checkout'
import getCurrentSHA from '@lerna/publish/lib/get-current-sha'
import getCurrentTags from '@lerna/publish/lib/get-current-tags'
import getTaggedPackages from '@lerna/publish/lib/get-tagged-packages'
import { createRunner } from '@lerna/run-lifecycle'
import collectUpdates from '@lerna/collect-updates'
import ConventionalCommitUtilities from '@lerna/conventional-commits'
import checkWorkingTree from '@lerna/check-working-tree'
import describeRef from '@lerna/describe-ref'
import runTopologically from '@lerna/run-topologically'
import gitAdd from '@lerna/version/lib/git-add'
import gitCommit from '@lerna/version/lib/git-commit'
import gitTag from '@lerna/version/lib/git-tag'
import createRelease from '@lerna/version/lib/create-release'
import getCurrentBranch from '@lerna/version/lib/get-current-branch'
import gitPush from '@lerna/version/lib/git-push'
import { updateLockfileVersion } from '@lerna/version/lib/update-lockfile-version'
import ValidationError from '@lerna/validation-error'
import npmConf from '@lerna/npm-conf'
export async function lerna_version__submodules(argv) {
	const command = new VersionSubmoduleCommand(argv)
	return await command.runner
}
export async function lerna_publish__submodules(argv) {
	const command = new PublishSubmoduleCommand(argv)
	return await command.runner
}
class VersionSubmoduleCommand extends VersionCommand {
	argv:any
	runner:Promise<any>
	options:any
	execOpts:any
	gitOpts:any
	logger:any
	project:any
	concurrency:number
	globalVersion:string
	tagPrefix:string
	requiresGit:boolean
	currentBranch:string
	pushToRemote:boolean
	gitRemote:string
	commitAndTag:boolean
	updates:any[]
	packageGraph:any
	composed:boolean
	hasRootedLeaf:boolean
	runPackageLifecycle:(any, string)=>any
	runRootLifecycle:(any)=>any
	setUpdatesForVersions:any
	getVersionsForUpdates:any
	confirmVersions:()=>Promise<any>
	packagesToVersion:any[]
	updatesVersions:Map<string, string>
	createRelease:boolean
	releaseNotes:{ name:string, notes:any }[]
	commitAndTagUpdates:()=>Promise<any>
	tags:string[]
	savePrefix:string
	constructor(argv) {
		super(argv)
	}
	async initialize() {
		if (!this.project.isIndependent()) {
			this.logger.info('current version', this.project.version)
		}
		const updatesA2 = await Promise.all(
			this.packageGraph.rawPackageList.map(
				pkg=>{
					return collectUpdates(
						[pkg],
						this.packageGraph,
						this.execOptsPkg(pkg),
						this.options
					)
				}
			)
		)
		this.updates =
			[].concat(...updatesA2)
				.filter(node=>{
					if (!node.version) {
						// a package may be unversioned only if it is private
						if (node.pkg.private) {
							this.logger.info('version', 'Skipping unversioned private package %j', node.name)
						} else {
							throw new ValidationError(
								'ENOVERSION',
								dedent`
									A version field is required in ${node.name}'s package.json file.
									If you wish to keep the package unversioned, it must be made private.
								`
							)
						}
					}
					return !!node.version
				})
		if (!this.updates.length) {
			this.logger.success(`No changed packages to ${this.composed ? 'publish' : 'version'}`)
			// still exits zero, aka "ok"
			return false
		}
		// a "rooted leaf" is the regrettable pattern of adding "." to the "packages" config in lerna.json
		this.hasRootedLeaf = this.packageGraph.has(this.project.manifest.name)
		if (this.hasRootedLeaf && !this.composed) {
			this.logger.info('version', 'rooted leaf detected, skipping synthetic root lifecycles')
		}
		this.runPackageLifecycle = createRunner(this.options)
		// don't execute recursively if run from a poorly-named script
		this.runRootLifecycle =
			/^(pre|post)?version$/.test(process.env.npm_lifecycle_event)
			? stage=>{
				this.logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
			}
			: stage=>this.runPackageLifecycle(this.project.manifest, stage)
		const tasks = [
			()=>this.getVersionsForUpdates(),
			versions=>this.setUpdatesForVersions(versions),
			()=>this.confirmVersions(),
		]
		// amending a commit probably means the working tree is dirty
		if (this.commitAndTag && this.gitOpts.amend !== true) {
			this.packageGraph.forEach(pkg=>{
				const execOpts = this.execOptsPkg(pkg)
				const check = checkWorkingTree.mkThrowIfUncommitted(execOpts)
				tasks.unshift(async ()=>{
					try {
						const ref = await describeRef(execOpts)
						return await check(ref)
					} catch (e) {
						if (e.name === 'ValidationError') {
							log.error(pkg.location)
						}
						throw e
					}
				})
			})
		} else {
			this.logger.warn('version', 'Skipping working tree validation, proceed at your own risk')
		}
		return pWaterfall(tasks)
	}
	async execute() {
		const tasks:(()=>Promise<any>)[] = [()=>this.updatePackageVersions()]
		if (this.commitAndTag) {
			tasks.push(()=>this.commitAndTagUpdates())
		} else {
			this.logger.info('execute', 'Skipping git tag/commit')
		}
		if (this.pushToRemote) {
			tasks.push(()=>this.gitPushToRemote())
		} else {
			this.logger.info('execute', 'Skipping git push')
		}
		if (this.createRelease) {
			this.logger.info('execute', 'Creating releases...')
			this.packagesToVersion.forEach(pkg=>{
				tasks.push(()=>
					createRelease(
						this.options.createRelease,
						{ tags: this.tags, releaseNotes: this.releaseNotes },
						{ gitRemote: this.options.gitRemote, execOpts: this.execOptsPkg(pkg) }
					)
				)
			})
		} else {
			this.logger.info('execute', 'Skipping releases')
		}
		return pWaterfall(tasks).then(()=>{
			if (!this.composed) {
				this.logger.success('version', 'finished')
			}
			return {
				updates: this.updates,
				updatesVersions: this.updatesVersions,
			}
		})
	}
	updatePackageVersions() {
		const { conventionalCommits, changelogPreset, changelog = true } = this.options
		const independentVersions = this.project.isIndependent()
		const rootPath = this.project.manifest.location
		const changedFiles = new Set()
		// my kingdom for async await :(
		let chain = Promise.resolve()
		// preversion:  Run BEFORE bumping the package version.
		// version:     Run AFTER bumping the package version, but BEFORE commit.
		// postversion: Run AFTER bumping the package version, and AFTER commit.
		// @see https://docs.npmjs.com/misc/scripts
		if (!this.hasRootedLeaf) {
			// exec preversion lifecycle in root (before all updates)
			chain = chain.then(()=>this.runRootLifecycle('preversion'))
		}
		const actions:(pPipe.UnaryFunction<any, unknown>)[] = [
			pkg=>this.runPackageLifecycle(pkg, 'preversion').then(()=>pkg),
			// manifest may be mutated by any previous lifecycle
			pkg=>pkg.refresh(),
			pkg=>{
				// set new version
				pkg.version = this.updatesVersions.get(pkg.name)
				// update pkg dependencies
				for (const [depName, resolved] of this.packageGraph.get(pkg.name).localDependencies) {
					const depVersion = this.updatesVersions.get(depName)
					if (depVersion && resolved.type !== 'directory') {
						// don't overwrite local file: specifiers, they only change during publish
						pkg.updateLocalDependency(resolved, depVersion, this.savePrefix)
					}
				}
				return Promise.all([updateLockfileVersion(pkg), pkg.serialize()]).then(([lockfilePath])=>{
					// commit the updated manifest
					changedFiles.add(pkg.manifestLocation)
					if (lockfilePath) {
						changedFiles.add(lockfilePath)
					}
					return pkg
				})
			},
			pkg=>this.runPackageLifecycle(pkg, 'version').then(()=>pkg),
		]
		if (conventionalCommits && changelog) {
			// we can now generate the Changelog, based on the
			// the updated version that we're about to release.
			const type = independentVersions ? 'independent' : 'fixed'
			actions.push(pkg=>
				ConventionalCommitUtilities.updateChangelog(pkg, type, {
					changelogPreset,
					rootPath,
					tagPrefix: this.tagPrefix,
				}).then(({ logPath, newEntry })=>{
					// commit the updated changelog
					changedFiles.add(logPath)
					// add release notes
					if (independentVersions) {
						this.releaseNotes.push({
							name: pkg.name,
							notes: newEntry,
						})
					}
					return pkg
				})
			)
		}
		const mapUpdate = pPipe(...actions)
		chain = chain.then(()=>
			runTopologically(this.packagesToVersion, mapUpdate, {
				concurrency: this.concurrency,
				rejectCycles: this.options.rejectCycles,
			})
		)
		if (!independentVersions) {
			this.project.version = this.globalVersion
			if (conventionalCommits && changelog) {
				chain = chain.then(()=>
					ConventionalCommitUtilities.updateChangelog(this.project.manifest, 'root', {
						changelogPreset,
						rootPath,
						tagPrefix: this.tagPrefix,
						version: this.globalVersion,
					}).then(({ logPath, newEntry })=>{
						// commit the updated changelog
						changedFiles.add(logPath)
						// add release notes
						this.releaseNotes.push({
							name: 'fixed',
							notes: newEntry,
						})
					})
				)
			}
			chain = chain.then(()=>
				this.project.serializeConfig().then(lernaConfigLocation=>{
					// commit the version update
					changedFiles.add(lernaConfigLocation)
				})
			)
		}
		if (!this.hasRootedLeaf) {
			// exec version lifecycle in root (after all updates)
			chain = chain.then(()=>this.runRootLifecycle('version'))
		}
		if (this.commitAndTag) {
			chain = chain.then(
				()=>{
					this.packagesToVersion.map(pkg=>{
						const execOpts = this.execOptsPkg(pkg)
						const { cwd } = execOpts
						return gitAdd(
							Array.from(changedFiles)
								.filter((file:string)=>!file.indexOf(cwd)),
							execOpts)
					})
				}
			)
		}
		return chain
	}
	execOptsPkg(pkg) {
		return Object.assign({}, this.execOpts, { cwd: pkg.location })
	}
	async gitCommitAndTagVersionForUpdates() {
		const subject = this.options.message || 'Publish'
		const promises = this.packagesToVersion.map(async pkg=>{
			const tag = `${pkg.name}@${this.updatesVersions.get(pkg.name)}`
			const message = `${subject}${os.EOL}${os.EOL} - ${tag}`
			const execOpts = this.execOptsPkg(pkg)
			await gitCommit(message, this.gitOpts, execOpts)
			await gitTag(tag, this.gitOpts, execOpts)
			return tag
		})
		this.tags = await Promise.all(promises)
		return this.tags
	}
	async gitCommitAndTagVersion() {
		const version = this.globalVersion
		const tag = `${this.tagPrefix}${version}`
		const message =
			this.options.message
			? this.options.message.replace(/%s/g, tag).replace(/%v/g, version)
			: tag
		const promises = this.packagesToVersion.map(async pkg=>{
			const execOpts = this.execOptsPkg(pkg)
			await gitCommit(message, this.gitOpts, execOpts)
			await gitTag(tag, this.gitOpts, execOpts)
			return tag
		})
		await Promise.all(promises)
		this.tags = [tag]
		return this.tags
	}
	async gitPushToRemote() {
		this.logger.info('git', 'Pushing tags...')
		return this.packagesToVersion.map(pkg=>{
			const execOpts = this.execOptsPkg(pkg)
			return gitPush(this.gitRemote, getCurrentBranch(execOpts), execOpts)
		})
	}
}
class PublishSubmoduleCommand extends PublishCommand {
	argv:any
	options:any
	execOpts:any
	logger:any
	npmSession:any
	userAgent:any
	conf:any
	otpCache:any
	getDistTag:()=>string
	hasRootedLeaf:boolean
	packageGraph:any
	project:any
	runPackageLifecycle:any
	runRootLifecycle:any
	detectFromPackage:()=>any
	updates:any
	updatesVersions:Map<any, any>
	packagesToPublish:any
	confirmPublish:()=>boolean
	runner:Promise<any>
	tagPrefix:string
	constructor(argv) {
		super(argv)
	}
	async initialize() {
		if (this.options.skipNpm) {
			// TODO: remove in next major release
			this.logger.warn('deprecated', 'Instead of --skip-npm, call `lerna version` directly')
			const version = new VersionSubmoduleCommand(this.argv)
			await version.runner
			return false
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
			npmSession: this.npmSession,
			npmVersion: this.userAgent,
			otp: this.options.otp,
			registry: this.options.registry,
			'ignore-prepublish': this.options.ignorePrepublish,
			'ignore-scripts': this.options.ignoreScripts,
		})
		// cache to hold a one-time-password across publishes
		this.otpCache = { otp: this.conf.get('otp') }
		this.conf.set('user-agent', this.userAgent, 'cli')
		if (this.conf.get('registry') === 'https://registry.yarnpkg.com') {
			this.logger.warn('', 'Yarn\'s registry proxy is broken, replacing with public npm registry')
			this.logger.warn('', 'If you don\'t have an npm token, you should exit and run `npm login`')
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
		this.runPackageLifecycle = createRunner(this.options)
		// don't execute recursively if run from a poorly-named script
		this.runRootLifecycle =
			/^(pre|post)?publish$/.test(process.env.npm_lifecycle_event)
			? stage=>{
				this.logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
			}
			: stage=>this.runPackageLifecycle(this.project.manifest, stage)
		let chain:Promise<any> = Promise.resolve()
		if (this.options.bump === 'from-git') {
			chain = chain.then(()=>this.detectFromGit())
		} else if (this.options.bump === 'from-package') {
			chain = chain.then(()=>this.detectFromPackage())
		} else if (this.options.canary) {
			chain = chain.then(()=>this.detectCanaryVersions())
		} else {
			chain = chain.then(()=>new VersionSubmoduleCommand(this.argv))
		}
		return chain.then(result=>{
			if (!result) {
				// early return from nested VersionCommand
				return false
			}
			if (!result.updates.length) {
				this.logger.success('No changed packages to publish')
				// still exits zero, aka "ok"
				return false
			}
			this.updates = result.updates
			this.updatesVersions = new Map(result.updatesVersions)
			this.packagesToPublish = this.updates.map(({ pkg })=>pkg).filter(pkg=>!pkg.private)
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
			return true
		})
	}
	execOptsPkg(pkg) {
		return Object.assign({}, this.execOpts, { cwd: pkg.location })
	}
	async verifyWorkingTreeClean() {
		return Promise.all(this.packagesToPublish.map(pkg=>{
			return describeRef(this.execOptsPkg(pkg)).then(checkWorkingTree.throwIfUncommitted)
		}))
	}
	async detectFromGit() {
		const matchingPattern = this.project.isIndependent() ? '*@*' : `${this.tagPrefix}*.*.*`
		await this.verifyWorkingTreeClean()
		const updates = await Promise.all(this.packagesToPublish.map(pkg=>{
			const execOpts = this.execOptsPkg(pkg)
			const taggedPackageNames = getCurrentTags(execOpts, matchingPattern)
			if (!taggedPackageNames.length) {
				this.logger.notice('from-git', 'No tagged release found')
				return []
			}
			if (this.project.isIndependent()) {
				return taggedPackageNames.map(name=>this.packageGraph.get(name))
			}
			return getTaggedPackages(this.packageGraph, this.project.rootPath, execOpts)
		}))
		const updatesVersions = updates.map(({ pkg })=>[pkg.name, pkg.version])
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
		const release = bump.startsWith('pre') ? bump.replace('release', 'patch') : `pre${bump}`
		let chain:Promise<any> = Promise.resolve()
		// attempting to publish a canary release with local changes is not allowed
		chain = chain.then(()=>this.verifyWorkingTreeClean())
		// find changed packages since last release, if any
		chain = chain.then(async ()=>{
				const updatesA2 = await Promise.all(
					this.packageGraph.rawPackageList.map(
						pkg=>{
							return collectUpdates(
								[pkg],
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
				return [].concat(...updatesA2)
			}
		)
		const makeVersion = ({ lastVersion, refCount, sha })=>{
			// the next version is bumped without concern for preid or current index
			const nextVersion = semver.inc(lastVersion, release.replace('pre', ''))
			// semver.inc() starts a new prerelease at .0, git describe starts at .1
			// and build metadata is always ignored when comparing dependency ranges
			return `${nextVersion}-${preid}.${Math.max(0, refCount - 1)}+${sha}`
		}
		if (this.project.isIndependent()) {
			// each package is described against its tags only
			chain = chain.then(updates=>
				pMap(updates, ({ pkg })=>
					describeRef(
						{
							match: `${pkg.name}@*`,
							cwd: pkg.location,
						},
						includeMergedTags
					)
						.then(({ lastVersion = pkg.version, refCount, sha })=>
							// an unpublished package will have no reachable git tag
							makeVersion({ lastVersion, refCount, sha })
						)
						.then(version=>[pkg.name, version])
				).then(updatesVersions=>({
					updates,
					updatesVersions,
				}))
			)
		} else {
			// all packages are described against the last tag
			chain = chain.then(async updates=>{
					return Promise.all(updates.map(({ pkg })=>{
						const { cwd } = this.execOptsPkg(pkg)
						return describeRef(
							{
								match: `${this.tagPrefix}*.*.*`,
								cwd,
							},
							includeMergedTags
						)
							.then(makeVersion)
							.then(version=>updates.map(({ pkg })=>[pkg.name, version]))
							.then(updatesVersions=>({
								updates,
								updatesVersions,
							}))
					}))
				}
			)
		}
		return chain.then(({ updates, updatesVersions })=>({
			updates,
			updatesVersions,
			needsConfirmation: true,
		}))
	}
	async resetChanges() {
		const gitCheckout_ = (dirtyManifests, execOpts)=>{
			return gitCheckout(dirtyManifests, execOpts).catch(err=>{
				this.logger.silly('EGITCHECKOUT', err.message)
				this.logger.notice('FYI', 'Unable to reset working tree changes, this probably isn\'t a git repo.')
			})
		}
		// the package.json files are changed (by gitHead if not --canary)
		// and we should always __attempt_ to leave the working tree clean
		return await Promise.all([
			gitCheckout_([this.project.manifest], this.execOpts),
			...this.packagesToPublish.map(pkg=>{
				const execOpts = this.execOptsPkg(pkg)
				const { cwd } = execOpts
				return gitCheckout_(
					[path.relative(cwd, pkg.manifestLocation)],
					execOpts)
			})
		])
	}
}
