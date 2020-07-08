import version from '@lerna/version';
export declare class VersionSubmoduleCommand extends version.VersionCommand {
    argv: any;
    runner: Promise<any>;
    options: any;
    execOpts: any;
    gitOpts: any;
    logger: any;
    project: any;
    concurrency: number;
    globalVersion: string;
    tagPrefix: string;
    requiresGit: boolean;
    currentBranch: string;
    pushToRemote: boolean;
    gitRemote: string;
    commitAndTag: boolean;
    gitReset: boolean;
    updates: any[];
    packageGraph: any;
    composed: boolean;
    hasRootedLeaf: boolean;
    runPackageLifecycle: (any: any, string: any) => any;
    runRootLifecycle: (any: any) => any;
    setUpdatesForVersions: any;
    getVersionsForUpdates: any;
    confirmVersions: () => Promise<any>;
    packagesToVersion: any[];
    updatesVersions: Map<string, string>;
    releaseNotes: {
        name: string;
        notes: any;
    }[];
    commitAndTagUpdates: () => Promise<any>;
    tags: string[];
    savePrefix: string;
    packagesToPublish: any;
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
    execOptsPkg(pkg: any): any;
    gitCommitAndTagVersionForUpdates(): Promise<string[]>;
    gitCommitAndTagVersion(): Promise<string[]>;
    gitPushToRemote(): Promise<any>;
}