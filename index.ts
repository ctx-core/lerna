import { VersionSubmoduleCommand } from './version'
import { PublishSubmoduleCommand } from './publish'

export async function lerna_version__submodules(argv) {
	console.debug('lerna_version__submodules|debug|1')
	const command = new VersionSubmoduleCommand(argv)
	return await command.runner
}

export async function lerna_publish__submodules(argv) {
	console.debug('lerna_publish__submodules|debug|1')
	const command = new PublishSubmoduleCommand(argv)
	return await command.runner
}
