import publish from '@lerna/publish';
export declare class PublishSubmoduleCommand extends publish.PublishCommand {
    argv: any;
    options: any;
    execOpts: any;
    logger: any;
    npmSession: any;
    userAgent: any;
    conf: any;
    otpCache: any;
    getDistTag: () => string;
    hasRootedLeaf: boolean;
    packageGraph: any;
    project: any;
    runPackageLifecycle: any;
    runRootLifecycle: any;
    detectFromPackage: () => any;
    updates: any;
    updatesVersions: Map<any, any>;
    packagesToPublish: any;
    confirmPublish: () => boolean;
    runner: Promise<any>;
    tagPrefix: string;
    constructor(argv: any);
    initialize(): Promise<boolean>;
    execOptsPkg(pkg: any): any;
    verifyWorkingTreeClean(): Promise<[unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown]>;
    detectFromGit(): Promise<{
        updates: [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
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
