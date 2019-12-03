import Command from '@lerna/command'
import { VersionCommand } from '@lerna/version'
import { PublishCommand } from '@lerna/publish'
import runTopologically from '@lerna/run-topologically'
import { createRunner } from '@lerna/run-lifecycle'
import gitCommit from '@lerna/version/lib/git-commit'
import gitTag from '@lerna/version/lib/git-tag'
import gitAdd from '@lerna/version/lib/git-add'
import npmConf from '@lerna/npm-conf'
export async function lerna_version__submodules(argv) {
	const command = new VersionSubmoduleCommand(argv)
	return await command.runner
}
export async function lerna_publish__submodules(argv) {
	const command = new PublishSubmoduleCommand(argv)
	return await command.runner
}
type ARGV__GitCommitAndTagVersionSubmoduleCommand = {
	pkg:any
	version:string
	tag:string
	execOpts:any
	message?:string
	[key:string]:any
}
class VersionSubmoduleCommand extends Command {
	argv:any
	runner:Promise<any>
	constructor(argv) {
		super(argv)
	}
	async initialize() {
	}
	async execute() {
		// lerna version --skip-git
		const version =
			new VersionCommand(
				Object.assign({},
					this.argv, {
						gitTagVersion: false,
						'git-tag-version': false,
						push: false,
					}))
		const rv = await version.runner
		const packages = version.packagesToVersion
		await runTopologically(
			packages,
			async pkg=>{
				const { location, name, version } = pkg
				gitAdd(['package.json'], {
					cwd: location,
				})
				const command = new GitCommitAndTagVersionSubmoduleCommand({
					pkg,
					version,
					tag: `${name}@${version}`,
					execOpts: {
						cwd: location,
					}
				})
				await command.runner
			},
			{
				concurrency: version.concurrency || 1,
			}
		)
		return rv
	}
}
class GitCommitAndTagVersionSubmoduleCommand extends Command {
	logger:any
	project:any
	options:any
	gitOpts:any
	execOpts:any
	runner:Promise<any>
	runPackageLifecycle:any
	// runRootLifecycle:any
	constructor(argv:ARGV__GitCommitAndTagVersionSubmoduleCommand) {
		super(argv)
	}
	get tag() {
		return this.options.tag
	}
	get pkg() {
		return this.options.pkg
	}
	get version() {
		return this.options.version
	}
	async initialize() {
		const {
			amend,
			commitHooks = true,
			signGitCommit,
			signGitTag,
		} = this.options
		this.runPackageLifecycle = createRunner(this.options)
		this.gitOpts = {
			amend,
			commitHooks,
			signGitCommit,
			signGitTag,
		}
		// don't execute recursively if run from a poorly-named script
		// this.runRootLifecycle =
		// 	/^(pre|post)?version$/.test(process.env.npm_lifecycle_event)
		// 	? stage=>{
		// 		this.logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
		// 	}
		// 	: stage=>this.runPackageLifecycle(this.project.manifest, stage)
		this.execOpts.cwd = this.options.execOpts.cwd || this.execOpts.cwd
	}
	async execute() {
		await this.commitAndTagUpdates()
	}
	async commitAndTagUpdates() {
		const { tag, version } = this
		const message =
			this.options.message
			? (
				this.options.message
					.replace(/%s/g, tag)
					.replace(/%v/g, version)
			)
			: tag
		await gitCommit(message, this.gitOpts, this.execOpts)
		await gitTag(tag, this.gitOpts, this.execOpts)
		await this.runPackageLifecycle(this.pkg, 'postversion')
		// await this.runRootLifecycle(this.pkg, 'postversion')
	}
}
class PublishSubmoduleCommand extends PublishCommand {
	argv:any
	options:any
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
	detectFromGit:()=>any
	detectFromPackage:()=>any
	detectCanaryVersions:()=>any
	updates:any
	updatesVersions:Map<any, any>
	packagesToPublish:any
	confirmPublish:()=>boolean
	runner:Promise<any>
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
		this.runRootLifecycle = /^(pre|post)?publish$/.test(process.env.npm_lifecycle_event)
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
}
