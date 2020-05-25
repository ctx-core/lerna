#!/usr/bin/env node
const cli = require('@lerna/cli')
main()
async function main() {
	const {
		lerna_version__submodules,
		lerna_publish__submodules,
	} = await import('../lib.js')
	const version_cli = require('@lerna/version/command.js')
	const publish_cli = require('@lerna/publish/command.js')
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
