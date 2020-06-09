export declare function collectUpdatesSubmodule(submodulePackage: any, filteredPackages: any, packageGraph: any, execOpts: any, commandOptions: any): Promise<any>;
export declare function collectPackagesSubmodule(submodulePackage: any, packages: any, { isCandidate, onInclude, excludeDependents }: {
    isCandidate?: (_node: any, _name: any) => boolean;
    onInclude: any;
    excludeDependents: any;
}): Promise<any[]>;
