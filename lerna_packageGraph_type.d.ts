import type { lerna_rawPackage_type } from './lerna_rawPackage_type';
import type { lerna_package_type } from './lerna_package_type';
export declare type lerna_packageGraph_type = {
    has(name: string): boolean;
    get(name: string): {
        localDependencies: [string, {
            type: string;
        }][];
    };
    rawPackageList: lerna_rawPackage_type[];
    forEach(fn: (pkg: lerna_package_type) => void): any;
};
