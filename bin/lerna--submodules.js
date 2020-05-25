#!/usr/bin/env node
import cli from '@lerna/cli'
import { lerna_version__submodules, lerna_publish__submodules } from '@ctx-core/lerna'
main()
async function main() {
	const version_cli = await import('@lerna/version/command')
	const publish_cli = await import('@lerna/publish/command')
	cli()
		.command(Object.assign({}, version_cli, {
			handler: lerna_version__submodules
		}))
		.command(Object.assign({}, publish_cli, {
			handler: lerna_publish__submodules
		}))
		.parse(process.argv.slice(2))
}
