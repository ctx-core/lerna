import type { lerna_package_type } from './lerna_package_type';
export interface lerna_packages_type {
    contents: unknown;
    location: unknown;
    manifestLocation: string;
    has(name: string): boolean;
    get(name: string): {
        localDependencies: [string, {
            type: string;
        }][];
    };
    set(name: string, val: unknown): any;
    rawPackageList: lerna_package_type[];
    forEach(fn: (pkg: lerna_package_type, name: string) => void): any;
    map(fn: ({ pkg: lerna_package_type }: {
        pkg: any;
    }) => lerna_package_type): lerna_package_type[];
}
