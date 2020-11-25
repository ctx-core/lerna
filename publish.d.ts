import publish from '@lerna/publish';
import type { lerna_logger_type } from './lerna_logger_type';
import type { lerna_project_type } from './lerna_project_type';
import type { lerna_options_type } from './lerna_options_type';
import type { lerna_packages_type } from './lerna_packages_type';
import type { lerna_package_type } from './lerna_package_type';
export interface lerna_conf_type {
    get(prop: string): unknown;
    set(prop: string, value: unknown, opt: unknown): unknown;
}
export declare type getDistTag = () => string;
export declare type detectFromPackage_type = () => unknown;
export declare type runPackageLifecycle_type = (manifest_type: any, str: any) => void;
export declare type confirmPublish_type = () => boolean;
export declare class PublishSubmoduleCommand extends publish.PublishCommand {
    argv: unknown;
    options?: lerna_options_type;
    execOpts: unknown;
    logger?: lerna_logger_type;
    npmSession?: string;
    userAgent?: string;
    conf?: lerna_conf_type;
    otpCache: unknown;
    getDistTag?: getDistTag;
    hasRootedLeaf?: boolean;
    packageGraph?: lerna_packages_type;
    project?: lerna_project_type;
    runPackageLifecycle?: runPackageLifecycle_type;
    runRootLifecycle: unknown;
    detectFromPackage?: detectFromPackage_type;
    updates?: lerna_packages_type;
    updatesVersions?: Map<any, any>;
    packagesToPublish?: lerna_package_type[];
    confirmPublish?: () => boolean;
    runner?: Promise<any>;
    tagPrefix?: string;
    constructor(argv: any);
    initialize(): Promise<boolean>;
    execOptsPkg(pkg: any): {
        cwd: any;
    };
    verifyWorkingTreeClean(): Promise<any[]>;
    detectFromGit(): Promise<{
        updates: any[];
        updatesVersions: any[][];
        needsConfirmation: boolean;
    }>;
    annotateGitHead(): void;
    detectCanaryVersions(): Promise<{
        updates: {
            pkg: lerna_package_type;
        }[];
        updatesVersions: any;
        needsConfirmation: boolean;
    }>;
    resetChanges(): Promise<any[]>;
}
