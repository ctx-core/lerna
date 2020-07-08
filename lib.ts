import log from 'npmlog'
import collectDependents from '@lerna/collect-updates/lib/collect-dependents.js'
import collectPackages from '@lerna/collect-updates/lib/collect-packages.js'
import getPackagesForOption from '@lerna/collect-updates/lib/get-packages-for-option.js'
import hasTags from '@lerna/collect-updates/lib/has-tags.js'
import makeDiffPredicate from '@lerna/collect-updates/lib/make-diff-predicate.js'
import describeRef from '@lerna/describe-ref'

import { VersionSubmoduleCommand } from './version'
import { PublishSubmoduleCommand } from './publish'

export async function lerna_version__submodules(argv) {
	const command = new VersionSubmoduleCommand(argv)
	return await command.runner
}

export async function lerna_publish__submodules(argv) {
	const command = new PublishSubmoduleCommand(argv)
	return await command.runner
}

export async function collectUpdatesSubmodule(submodulePackage, filteredPackages, packageGraph, execOpts, commandOptions) {
	const { forcePublish, conventionalCommits, conventionalGraduate, excludeDependents } = commandOptions
	// If --conventional-commits and --conventional-graduate are both set, ignore --force-publish
	const useConventionalGraduate = conventionalCommits && conventionalGraduate
	const forced = getPackagesForOption(useConventionalGraduate ? conventionalGraduate : forcePublish)
	const packages =
		filteredPackages.length === packageGraph.size
			? packageGraph
			: new Map(filteredPackages.map(({ name }) => [name, packageGraph.get(name)]))
	let committish = commandOptions.since
	if (hasTags(execOpts)) {
		// describe the last annotated tag in the current branch
		const { sha, refCount, lastTagName } = describeRef.sync(execOpts, commandOptions.includeMergedTags)
		// TODO: warn about dirty tree?
		if (refCount === '0' && forced.size === 0 && !committish) {
			// no commits since previous release
			log.notice('', 'Current HEAD is already released, skipping change detection.')
			return []
		}
		if (commandOptions.canary) {
			// if it's a merge commit, it will return all the commits that were part of the merge
			// ex: If `ab7533e` had 2 commits, ab7533e^..ab7533e would contain 2 commits + the merge commit
			committish = `${ sha }^..${ sha }`
		} else if (!committish) {
			// if no tags found, this will be undefined and we'll use the initial commit
			committish = lastTagName
		}
	}
	if (forced.size) {
		// "warn" might seem a bit loud, but it is appropriate for logging anything _forced_
		log.warn(
			useConventionalGraduate ? 'conventional-graduate' : 'force-publish',
			forced.has('*') ? 'all packages' : Array.from(forced.values()).join('\n')
		)
	}
	if (useConventionalGraduate) {
		// --conventional-commits --conventional-graduate
		if (forced.has('*')) {
			log.info('', 'Graduating all prereleased packages')
		} else {
			log.info('', 'Graduating prereleased packages')
		}
	} else if (!committish || forced.has('*')) {
		// --force-publish or no tag
		log.info('', 'Assuming all packages changed')
		return collectPackages(packages, {
			onInclude: name => log.verbose('updated', name),
			excludeDependents,
		})
	}
	log.info('', `Looking for changed packages since ${ committish }`)
	const hasDiff = makeDiffPredicate(committish, execOpts, commandOptions.ignoreChanges)
	const needsBump =
		!commandOptions.bump || commandOptions.bump.startsWith('pre')
			? () => false
			: /* skip packages that have not been previously prereleased */
			node => node.prereleaseId
	const isForced = (node, name) =>
		(forced.has('*') || forced.has(name)) && (useConventionalGraduate ? node.prereleaseId : true)
	return collectPackagesSubmodule(submodulePackage, packages, {
		isCandidate: (node, name) => isForced(node, name) || needsBump(node) || hasDiff(node),
		onInclude: name => log.verbose('updated', name),
		excludeDependents,
	})
}

export async function collectPackagesSubmodule(
	submodulePackage,
	packages,
	{
		isCandidate = (_node, _name) => true,
		onInclude,
		excludeDependents
	}
) {
	const candidates = new Set()
	if (isCandidate(submodulePackage, submodulePackage.name)) {
		candidates.add(packages.get(submodulePackage.name))
	}
	if (!excludeDependents) {
		collectDependents(candidates).forEach(node => candidates.add(node))
	}
	// The result should always be in the same order as the input
	const updates = []
	packages.forEach((node, name) => {
		if (candidates.has(node)) {
			if (onInclude) {
				onInclude(name)
			}
			updates.push(node)
		}
	})
	return updates
}
