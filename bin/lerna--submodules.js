#!/usr/bin/env node
import cli from '@lerna/cli'
import version_cli from '@lerna/version/command'
import publish_cli from '@lerna/publish/command'
import { lerna_version__submodules, lerna_publish__submodules } from '../lib'
cli()
	.command(Object.assign({}, version_cli, {
		handler: lerna_version__submodules
	}))
	.command(Object.assign({}, publish_cli, {
		handler: lerna_publish__submodules
	}))
	.parse(process.argv.slice(2))
