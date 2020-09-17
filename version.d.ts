import version from '@lerna/version';
import type { lerna_logger_type } from './lerna_logger_type';
import type { lerna_project_type } from './lerna_project_type';
import type { lerna_options_type } from './lerna_options_type';
import type { lerna_packageGraph_type } from './lerna_packageGraph_type';
export declare class VersionSubmoduleCommand extends version.VersionCommand {
    argv: unknown;
    runner: Promise<any>;
    options: lerna_options_type;
    execOpts: unknown;
    gitOpts: {
        amend: unknown;
    };
    logger: lerna_logger_type;
    project: lerna_project_type;
    concurrency: number;
    globalVersion: string;
    tagPrefix: string;
    requiresGit: boolean;
    currentBranch: string;
    pushToRemote: boolean;
    gitRemote: string;
    commitAndTag: boolean;
    gitReset: boolean;
    updates: unknown[];
    packageGraph: lerna_packageGraph_type;
    composed: boolean;
    hasRootedLeaf: boolean;
    runPackageLifecycle: (any: any, string: any) => any;
    runRootLifecycle: (any: any) => any;
    setUpdatesForVersions: (version: unknown) => unknown;
    getVersionsForUpdates: () => unknown;
    confirmVersions: () => Promise<any>;
    packagesToVersion: unknown[];
    updatesVersions: Map<string, string>;
    releaseNotes: {
        name: string;
        notes: unknown;
    }[];
    commitAndTagUpdates: () => Promise<any>;
    tags: string[];
    savePrefix: string;
    packagesToPublish: unknown;
    enableProgressBar: () => void;
    prepareRegistryActions: () => Promise<void>;
    prepareLicenseActions: () => Promise<void>;
    updateCanaryVersions: () => Promise<void>;
    resolveLocalDependencyLinks: () => Promise<void>;
    annotateGitHead: () => Promise<void>;
    serializeChanges: () => Promise<void>;
    packUpdated: () => Promise<void>;
    publishPacked: () => Promise<void>;
    resetChanges: () => Promise<void>;
    npmUpdateAsLatest: () => Promise<void>;
    constructor(argv: any);
    initialize(): Promise<unknown>;
    updatePackageVersions(): Promise<void>;
    execOptsPkg(pkg: any): {
        cwd: any;
    };
    gitCommitAndTagVersionForUpdates(): Promise<string[]>;
    gitCommitAndTagVersion(): Promise<string[]>;
    gitPushToRemote(): Promise<any[]>;
}
