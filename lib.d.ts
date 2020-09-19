import type { lerna_package_type } from './lerna_package_type';
import type { lerna_packages_type } from './lerna_packages_type';
export declare function lerna_version__submodules(argv: any): Promise<any>;
export declare function lerna_publish__submodules(argv: any): Promise<any>;
export declare function collectUpdatesSubmodule(submodulePackage: any, filteredPackages: any, packageGraph: any, execOpts: any, commandOptions: any): Promise<any>;
export declare function collectPackagesSubmodule(submodulePackage: lerna_package_type, packages: lerna_packages_type, { isCandidate, onInclude, excludeDependents }: {
    isCandidate?: ((_node: any, _name: any) => boolean) | undefined;
    onInclude: any;
    excludeDependents: any;
}): Promise<lerna_package_type[]>;
