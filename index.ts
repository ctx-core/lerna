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
