import publish from '@lerna/publish';
import type { lerna_logger_type } from './lerna_logger_type';
import type { lerna_project_type } from './lerna_project_type';
import type { lerna_options_type } from './lerna_options_type';
import type { lerna_packageGraph_type } from './lerna_packageGraph_type';
import type { lerna_package_type } from './lerna_package_type';
export declare class PublishSubmoduleCommand extends publish.PublishCommand {
    argv: unknown;
    options: lerna_options_type;
    execOpts: unknown;
    logger: lerna_logger_type;
    npmSession: string;
    userAgent: string;
    conf: {
        get(prop: string): unknown;
        set(prop: string, value: unknown, opt: unknown): unknown;
    };
    otpCache: unknown;
    getDistTag: () => string;
    hasRootedLeaf: boolean;
    packageGraph: lerna_packageGraph_type;
    project: lerna_project_type;
    runPackageLifecycle: (manifest_type: any, str: any) => void;
    runRootLifecycle: unknown;
    detectFromPackage: () => any;
    updates: unknown[];
    updatesVersions: Map<any, any>;
    packagesToPublish: lerna_package_type[];
    confirmPublish: () => boolean;
    runner: Promise<any>;
    tagPrefix: string;
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
        updates: any[];
        updatesVersions: any;
        needsConfirmation: boolean;
    }>;
    resetChanges(): Promise<any[]>;
}
