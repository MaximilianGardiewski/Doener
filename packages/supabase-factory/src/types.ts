export const FACTORY_API_VERSION = "factory.supabase.local/v1" as const;

export const SUPABASE_BASELINE = {
  release: "self-hosted/v0.8.0",
  upstreamCommit: "241bb11c0627f2981746d37033f57dbfa81d29b0",
  postgresMajor: 17,
  gateway: "envoy",
} as const;

export type ProjectEnvironment = "development" | "staging" | "production";
export type ProjectProfileName = "minimal" | "webapp" | "realtime" | "full" | "production-critical";
export type StorageBackend = "file" | "s3";
export type StudioExposure = "disabled" | "internal";

export type SupabaseService =
  | "database"
  | "auth"
  | "rest"
  | "gateway"
  | "storage"
  | "realtime"
  | "functions"
  | "studio"
  | "analytics";

export interface ProjectIdentity {
  id: string;
  environment: ProjectEnvironment;
  displayName?: string;
}

export interface SupabaseVersionSpec {
  release?: string;
  /** Exact commit the self-hosted release tag must resolve to. Required for a non-baseline release. */
  upstreamCommit?: string;
  postgresMajor?: 15 | 17;
}

export interface FeatureSpec {
  auth?: boolean;
  rest?: boolean;
  storage?: boolean;
  realtime?: boolean;
  functions?: boolean;
  studio?: StudioExposure;
  analytics?: boolean;
}

export interface StorageSpec {
  backend?: StorageBackend;
  bucketPrefix?: string;
  region?: string;
}

export interface SmtpSpec {
  adminEmail: string;
  host: string;
  port: number;
  senderName: string;
}

export interface AuthEmailSpec {
  enabled?: boolean;
  /** Auto-confirm is useful for controlled/dev flows; production normally leaves this false. */
  autoConfirm?: boolean;
  /** Non-secret SMTP routing. Credentials are injected separately as SecretRefs. */
  smtp?: SmtpSpec;
}

export interface AuthPhoneSpec {
  enabled?: boolean;
  autoConfirm?: boolean;
}

export interface AuthSpec {
  /** Global signup gate. Defaults to true only when an explicit signup method is enabled. */
  signupEnabled?: boolean;
  anonymousUsers?: boolean;
  jwtExpirySeconds?: number;
  email?: AuthEmailSpec;
  phone?: AuthPhoneSpec;
}

export interface BackupSpec {
  logical?: "off" | "daily" | "hourly";
  pitr?: boolean;
  storageReplication?: boolean;
  restoreDrill?: "off" | "weekly" | "monthly";
}

export interface SecuritySpec {
  rlsRequired?: boolean;
  databasePublic?: boolean;
  studioPublic?: boolean;
  requireHttps?: boolean;
  allowLegacyApiKeys?: boolean;
}

export interface SupabaseFactoryManifest {
  apiVersion: typeof FACTORY_API_VERSION;
  project: ProjectIdentity;
  profile: ProjectProfileName;
  supabase?: SupabaseVersionSpec;
  features?: FeatureSpec;
  storage?: StorageSpec;
  auth?: AuthSpec;
  backup?: BackupSpec;
  security?: SecuritySpec;
}

export interface ResolvedFactoryManifest {
  apiVersion: typeof FACTORY_API_VERSION;
  project: ProjectIdentity;
  profile: ProjectProfileName;
  supabase: {
    release: string;
    upstreamCommit: string;
    postgresMajor: 15 | 17;
    gateway: "envoy";
  };
  services: readonly SupabaseService[];
  storage: {
    backend: StorageBackend;
    bucketPrefix: string;
    region: string;
  };
  auth: {
    signupEnabled: boolean;
    anonymousUsers: boolean;
    jwtExpirySeconds: number;
    email: {
      enabled: boolean;
      autoConfirm: boolean;
      smtp?: SmtpSpec;
    };
    phone: {
      enabled: boolean;
      autoConfirm: boolean;
    };
  };
  backup: {
    logical: "off" | "daily" | "hourly";
    pitr: boolean;
    storageReplication: boolean;
    restoreDrill: "off" | "weekly" | "monthly";
  };
  security: {
    rlsRequired: boolean;
    databasePublic: false;
    studioPublic: false;
    requireHttps: boolean;
    allowLegacyApiKeys: boolean;
  };
}

export type LifecycleState =
  | "REQUESTED"
  | "VALIDATING"
  | "PLANNED"
  | "PROVISIONING"
  | "CONFIGURING"
  | "MIGRATING"
  | "VERIFYING"
  | "HEALTHY"
  | "DEGRADED"
  | "FAILED"
  | "RESTORING"
  | "UPGRADING"
  | "DESTROY_PENDING";

export type PlanOperationKind =
  | "allocate-project"
  | "checkout-supabase-release"
  | "generate-project-secrets"
  | "configure-network"
  | "configure-storage"
  | "configure-runtime"
  | "start-services"
  | "configure-backup"
  | "apply-migrations"
  | "verify-health"
  | "reconcile-services"
  | "upgrade-project"
  | "backup-project"
  | "restore-project"
  | "destroy-project";

export interface PlanOperation {
  id: string;
  kind: PlanOperationKind;
  summary: string;
  requiresApproval: boolean;
  dependsOn: readonly string[];
}

export interface ProvisioningPlan {
  projectId: string;
  desired: ResolvedFactoryManifest;
  operations: readonly PlanOperation[];
  cloudManagementCredentialsRequired: false;
  exposesSecretValues: false;
}

export interface ObservedProjectState {
  exists: boolean;
  state?: LifecycleState;
  release?: string;
  upstreamCommit?: string;
  postgresMajor?: 15 | 17;
  services?: readonly SupabaseService[];
  healthy?: boolean;
}

export interface ProjectRecord {
  id: string;
  desired: ResolvedFactoryManifest;
  state: LifecycleState;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  databaseCredentialConfigured: boolean;
  lastBackupAt?: string;
  lastRestoreDrillAt?: string;
}
