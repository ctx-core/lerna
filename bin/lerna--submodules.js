#!/usr/bin/env node
require = require('esm')(module)
const cli = require('@lerna/cli')
const version_cli = require('@lerna/version/command')
const publish_cli = require('@lerna/publish/command')
const { lerna_version__submodules, lerna_publish__submodules } = require('../lib')
cli()
	.command(Object.assign({}, version_cli, {
		handler: lerna_version__submodules
	}))
	.command(Object.assign({}, publish_cli, {
		handler: lerna_publish__submodules
	}))
	.parse(process.argv.slice(2))
