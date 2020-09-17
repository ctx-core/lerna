import type { lerna_manifest_type } from './lerna_manifest_type'
export type lerna_project_type = {
	isIndependent():boolean
	rootPath:string
	manifest:lerna_manifest_type
	serializeConfig(): Promise<void>
	version:string
}
