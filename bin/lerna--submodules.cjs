#!/usr/bin/env node
require = require('esm')(module)
const cli = require('@lerna/cli')
const {
	lerna_version__submodules,
	lerna_publish__submodules,
} = require('../')
const version_cli = require('@lerna/version/command')
const publish_cli = require('@lerna/publish/command')
main()
async function main() {
	cli()
		.command(
			version_cli.command,
			version_cli.describe,
			version_cli.builder,
			argv => {
				console.debug('lerva--submodules|debug|1')
				return lerna_version__submodules(argv)
			})
		.command(
			publish_cli.command,
			publish_cli.describe,
			publish_cli.builder,
			argv => {
				console.debug('lerva--submodules|debug|2')
				return lerna_publish__submodules(argv)
			})
		.parse(process.argv.slice(2))
}
