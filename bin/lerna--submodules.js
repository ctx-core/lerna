#!/usr/bin/env node
import cli from '@lerna/cli'
import {
	lerna_version__submodules,
	lerna_publish__submodules,
} from '../lib.js'
main()
async function main() {
	const version_cli = (await import('@lerna/version/command.js')).default
	const publish_cli = (await import('@lerna/publish/command.js')).default
	cli()
		.command(
			version_cli.command,
			version_cli.describe,
			version_cli.builder,
			lerna_version__submodules)
		.command(
			publish_cli.command,
			publish_cli.describe,
			publish_cli.builder,
			lerna_publish__submodules)
		.parse(process.argv.slice(2))
}
