import os from 'os'
import log from 'npmlog'
import dedent from 'dedent'
import pPipe from 'p-pipe'
import minimatch from 'minimatch'
import pWaterfall from 'p-waterfall'
import version from '@lerna/version'
// import output from '@lerna/output'
import ConventionalCommitUtilities from '@lerna/conventional-commits'
import collectUncommitted from '@lerna/collect-uncommitted'
import runTopologically from '@lerna/run-topologically'
import gitAdd from '@lerna/version/lib/git-add.js'
import gitCommit from '@lerna/version/lib/git-commit.js'
import gitTag from '@lerna/version/lib/git-tag.js'
import remoteBranchExists from '@lerna/version/lib/remote-branch-exists'
import isAnythingCommitted from '@lerna/version/lib/is-anything-committed'
import getCurrentBranch from '@lerna/version/lib/get-current-branch.js'
import gitPush from '@lerna/version/lib/git-push.js'
import updateLockfileVersion from '@lerna/version/lib/update-lockfile-version.js'
import ValidationError from '@lerna/validation-error'
import runLifecycle from '@lerna/run-lifecycle'
import checkWorkingTree from '@lerna/check-working-tree'
import describeRef from '@lerna/describe-ref'
import { collectUpdatesSubmodule } from './lib'
import type { lerna_logger_type } from './lerna_logger_type'
import type { lerna_project_type } from './lerna_project_type'
import type { lerna_options_type } from './lerna_options_type'
import type { lerna_packageGraph_type } from './lerna_packageGraph_type'

export class VersionSubmoduleCommand extends version.VersionCommand {
	argv: unknown
	runner: Promise<any>
	options: lerna_options_type
	execOpts: unknown
	gitOpts:{
		amend: unknown
	}
	logger: lerna_logger_type
	project: lerna_project_type
	concurrency: number
	globalVersion: string
	tagPrefix: string
	requiresGit: boolean
	currentBranch: string
	pushToRemote: boolean
	gitRemote: string
	commitAndTag: boolean
	gitReset: boolean
	updates: unknown[]
	packageGraph: lerna_packageGraph_type
	composed: boolean
	hasRootedLeaf: boolean
	runPackageLifecycle: (any, string) => any
	runRootLifecycle: (any) => any
	setUpdatesForVersions: (version: unknown) => unknown
	getVersionsForUpdates: () => unknown
	confirmVersions: () => Promise<any>
	packagesToVersion: unknown[]
	updatesVersions: Map<string, string>
	releaseNotes: { name: string, notes: unknown }[]
	commitAndTagUpdates: () => Promise<any>
	tags: string[]
	savePrefix: string
	packagesToPublish: unknown
	enableProgressBar: () => void
	prepareRegistryActions: () => Promise<void>
	prepareLicenseActions: () => Promise<void>
	updateCanaryVersions: () => Promise<void>
	resolveLocalDependencyLinks: () => Promise<void>
	annotateGitHead: () => Promise<void>
	serializeChanges: () => Promise<void>
	packUpdated: () => Promise<void>
	publishPacked: () => Promise<void>
	resetChanges: () => Promise<void>
	npmUpdateAsLatest: () => Promise<void>

	constructor(argv) {
		super(argv)
	}

	async initialize() {
		if (!this.project.isIndependent()) {
			this.logger.info('current version', this.project.version)
		}
		if (this.requiresGit) {
			// git validation, if enabled, should happen before updates are calculated and versions picked
			if (!isAnythingCommitted(this.execOpts)) {
				throw new ValidationError(
					"ENOCOMMIT",
					"No commits in this repository. Please commit something before using version."
				);
			}

			this.currentBranch = getCurrentBranch(this.execOpts);

			if (this.currentBranch === "HEAD") {
				throw new ValidationError(
					"ENOGIT",
					"Detached git HEAD, please checkout a branch to choose versions."
				);
			}

			if (this.pushToRemote && !remoteBranchExists(this.gitRemote, this.currentBranch, this.execOpts)) {
				throw new ValidationError(
					"ENOREMOTEBRANCH",
					dedent`
            Branch '${ this.currentBranch }' doesn't exist in remote '${ this.gitRemote }'.
            If this is a new branch, please make sure you push it to the remote first.
          `
				);
			}

			if (
				this.options.allowBranch &&
				![].concat(this.options.allowBranch).some(x => minimatch(this.currentBranch, x))
			) {
				throw new ValidationError(
					"ENOTALLOWED",
					dedent`
            Branch '${ this.currentBranch }' is restricted from versioning due to allowBranch config.
            Please consider the reasons for this restriction before overriding the option.
          `
				);
			}

			// if (
			// 	this.commitAndTag &&
			// 	this.pushToRemote &&
			// 	isBehindUpstream(this.gitRemote, this.currentBranch, this.execOpts)
			// ) {
			//
			// 	// eslint-disable-next-line max-len
			// 	const message = `Local branch '${this.currentBranch}' is behind remote upstream ${this.gitRemote}/${this.currentBranch}`;
			//
			// 	if (!this.options.ci) {
			// 		// interrupt interactive execution
			// 		throw new ValidationError(
			// 			"EBEHIND",
			// 			dedent`
			//         ${message}
			//         Please merge remote changes into '${this.currentBranch}' with 'git pull'
			//       `
			// 		);
			// 	}
			//
			// 	// CI execution should not error, but warn & exit
			// 	this.logger.warn("EBEHIND", `${message}, exiting`);
			//
			// 	// still exits zero, aka "ok"
			// 	return false;
			// }
		} else {
			this.logger.notice(
				"FYI",
				"git repository validation has been skipped, please ensure your version bumps are correct"
			);
		}
		if (this.options.conventionalPrerelease && this.options.conventionalGraduate) {
			throw new ValidationError(
				"ENOTALLOWED",
				dedent`
          --conventional-prerelease cannot be combined with --conventional-graduate.
        `
			);
		}
		const updatesA2 = await Promise.all(
			this.packageGraph.rawPackageList.map(
				async (pkg) => {
					const execOpts = this.execOptsPkg(pkg)
					return await collectUpdatesSubmodule(
						pkg,
						this.packageGraph.rawPackageList,
						this.packageGraph,
						execOpts,
						this.options
					)
				}
			)
		)
		this.updates =
			[].concat(...updatesA2)
				.filter((value, idx, self) =>
					self.indexOf(value) === idx)
				.filter(node => {
					// --no-private completely removes private packages from consideration
					if (node.pkg.private && this.options.private === false) {
						// TODO: (major) make --no-private the default
						return false;
					}

					if (!node.version) {
						// a package may be unversioned only if it is private
						if (node.pkg.private) {
							this.logger.info("version", "Skipping unversioned private package %j", node.name);
						} else {
							throw new ValidationError(
								"ENOVERSION",
								dedent`
              A version field is required in ${ node.name }'s package.json file.
              If you wish to keep the package unversioned, it must be made private.
            `
							);
						}
					}

					return !!node.version;
				})
		if (!this.updates.length) {
			this.logger.success(`No changed packages to ${ this.composed ? 'publish' : 'version' }`)
			// still exits zero, aka "ok"
			return false
		}
		// a "rooted leaf" is the regrettable pattern of adding "." to the "packages" config in lerna.json
		this.hasRootedLeaf = this.packageGraph.has(this.project.manifest.name)
		if (this.hasRootedLeaf && !this.composed) {
			this.logger.info('version', 'rooted leaf detected, skipping synthetic root lifecycles')
		}
		this.runPackageLifecycle = runLifecycle.createRunner(this.options)
		// don't execute recursively if run from a poorly-named script
		this.runRootLifecycle =
			/^(pre|post)?version$/.test(process.env.npm_lifecycle_event)
				? stage => {
					this.logger.warn('lifecycle', 'Skipping root %j because it has already been called', stage)
				}
				: stage => this.runPackageLifecycle(this.project.manifest, stage)
		const tasks = [
			() => this.getVersionsForUpdates(),
			versions => this.setUpdatesForVersions(versions),
			() => this.confirmVersions(),
		]
		// amending a commit probably means the working tree is dirty
		if (this.commitAndTag && this.gitOpts.amend !== true) {
			this.packageGraph.forEach(pkg => {
				const execOpts = this.execOptsPkg(pkg)
				const check = checkWorkingTree.mkThrowIfUncommitted(execOpts)
				tasks.unshift(async () => {
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

	// async execute() {
	// 	this.enableProgressBar();
	// 	this.logger.info("publish", "Publishing packages to npm...");
	// 	let chain = Promise.resolve();
	// 	chain = chain.then(() => this.prepareRegistryActions());
	// 	chain = chain.then(() => this.prepareLicenseActions());
	//   if (this.options.canary) {
	//     chain = chain.then(() => this.updateCanaryVersions());
	//   }
	//   chain = chain.then(() => this.resolveLocalDependencyLinks());
	//   chain = chain.then(() => this.annotateGitHead());
	//   chain = chain.then(() => this.serializeChanges());
	//   chain = chain.then(() => this.packUpdated());
	//   chain = chain.then(() => this.publishPacked());
	//   if (this.gitReset) {
	//     chain = chain.then(() => this.resetChanges());
	//   }
	//
	//   if (this.options.tempTag) {
	//     chain = chain.then(() => this.npmUpdateAsLatest());
	//   }
	//
	//   return chain.then(() => {
	//     const count = this.packagesToPublish.length;
	//     const message = this.packagesToPublish.map(pkg => ` - ${pkg.name}@${pkg.version}`);
	//
	//     output("Successfully published:");
	//     output(message.join(os.EOL));
	//
	//     this.logger.success("published", "%d %s", count, count === 1 ? "package" : "packages");
	//   });
	// }

	async updatePackageVersions() {
		const { conventionalCommits, changelogPreset, changelog = true } = this.options
		const independentVersions = this.project.isIndependent()
		const rootPath = this.project.manifest.location
		const changedFiles = new Set()
		// preversion:  Run BEFORE bumping the package version.
		// version:     Run AFTER bumping the package version, but BEFORE commit.
		// postversion: Run AFTER bumping the package version, and AFTER commit.
		// @see https://docs.npmjs.com/misc/scripts
		if (!this.hasRootedLeaf) {
			// exec preversion lifecycle in root (before all updates)
			await this.runRootLifecycle('preversion')
		}
		const actions: (pPipe.UnaryFunction<any, unknown>)[] = [
			pkg => this.runPackageLifecycle(pkg, 'preversion').then(() => pkg),
			// manifest may be mutated by any previous lifecycle
			pkg => pkg.refresh(),
			pkg => {
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
				return Promise.all([updateLockfileVersion.updateLockfileVersion(pkg), pkg.serialize()]).then(([lockfilePath]) => {
					// commit the updated manifest
					changedFiles.add(pkg.manifestLocation)
					if (lockfilePath) {
						changedFiles.add(lockfilePath)
					}
					return pkg
				})
			},
			pkg => this.runPackageLifecycle(pkg, 'version').then(() => pkg),
		]
		if (conventionalCommits && changelog) {
			// we can now generate the Changelog, based on the
			// the updated version that we're about to release.
			const type = independentVersions ? 'independent' : 'fixed'
			actions.push(pkg =>
				ConventionalCommitUtilities.updateChangelog(pkg, type, {
					changelogPreset,
					rootPath,
					tagPrefix: this.tagPrefix,
				}).then(({ logPath, newEntry }) => {
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
		await runTopologically(this.packagesToVersion, mapUpdate, {
			concurrency: this.concurrency,
			rejectCycles: this.options.rejectCycles,
		})
		if (!independentVersions) {
			this.project.version = this.globalVersion
			if (conventionalCommits && changelog) {
				await ConventionalCommitUtilities.updateChangelog(this.project.manifest, 'root', {
					changelogPreset,
					rootPath,
					tagPrefix: this.tagPrefix,
					version: this.globalVersion,
				}).then(({ logPath, newEntry }) => {
					// commit the updated changelog
					changedFiles.add(logPath)
					// add release notes
					this.releaseNotes.push({
						name: 'fixed',
						notes: newEntry,
					})
				})
			}
			await this.project.serializeConfig().then(lernaConfigLocation => {
				// commit the version update
				changedFiles.add(lernaConfigLocation)
			})
		}
		if (!this.hasRootedLeaf) {
			// exec version lifecycle in root (after all updates)
			await this.runRootLifecycle('version')
		}
		if (this.commitAndTag) {
			await Promise.all(this.packageGraph.rawPackageList.map(pkg => {
					const execOpts = this.execOptsPkg(pkg)
					const { cwd } = execOpts
					return gitAdd(
						Array.from(changedFiles)
							.filter((file: string) => !file.indexOf(`${ cwd }/`)),
						{},
						execOpts)
				})
			)
		}
	}

	execOptsPkg(pkg) {
		return Object.assign({}, this.execOpts, { cwd: pkg.location })
	}

	async gitCommitAndTagVersionForUpdates() {
		const subject = this.options.message || 'Publish'
		const promises = this.packageGraph.rawPackageList.map(async pkg => {
			const tag = `${ pkg.name }@${ pkg.version }`
			const message = `${ subject }${ os.EOL }${ os.EOL } - ${ tag }`
			const execOpts = this.execOptsPkg(pkg)
			if ((await collectUncommitted(execOpts)).length) {
				await gitAdd(['package.json'], {}, execOpts)
				await gitCommit(message, this.gitOpts, execOpts)
				await gitTag(tag, this.gitOpts, execOpts)
			}
			return tag
		})
		this.tags = await Promise.all(promises)
		return this.tags
	}

	async gitCommitAndTagVersion() {
		const version = this.globalVersion
		const tag = `${ this.tagPrefix }${ version }`
		const message =
			this.options.message
				? this.options.message.replace(/%s/g, tag).replace(/%v/g, version)
				: tag
		const promises = this.packageGraph.rawPackageList.map(async pkg => {
			const execOpts = this.execOptsPkg(pkg)
			if ((await collectUncommitted(execOpts)).length) {
				await gitAdd(['package.json'], {}, execOpts)
				await gitCommit(message, this.gitOpts, execOpts)
				await gitTag(tag, this.gitOpts, execOpts)
			}
			return tag
		})
		await Promise.all(promises)
		this.tags = [tag]
		return this.tags
	}

	async gitPushToRemote() {
		this.logger.info('git', 'Pushing tags...')
		return this.packageGraph.rawPackageList.map(pkg => {
			const execOpts = this.execOptsPkg(pkg)
			return gitPush(this.gitRemote, getCurrentBranch(execOpts), execOpts)
		})
	}
}
